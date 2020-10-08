import _ from 'lodash';

import { flow as compose, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, readCorpusTextFile, setLogLabel, writeCorpusTextFile } from 'commons';
import { Logger } from 'winston';
import puppeteer from 'puppeteer-extra'
import { shaEncodeAsHex } from 'commons';
import { diffByChars } from 'commons';


import {
  Arrow,
  ExtractionEnv,
  ControlInstruction,
  NormalForm,
  forEachDo,
  FilterArrow,
  through,
  filter,
  tap,
  tapLeft,
  ClientFunc,
  ClientResult,
  composeSeries,
  log,
  FieldCandidate
} from './extraction-prelude';


import { ExtractionEvidence, Field } from './extraction-records';

import path from 'path';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';
import { Elem, expandCaseVariations, _queryAll, _queryOne, _selectElementAttr } from './html-queries';
import { runFileCmd } from '~/utils/run-cmd-file';

import parseUrl from 'url-parse';
import { GlobalDocumentMetadata } from './ieee-metadata';
import { CleaningRule, CleaningRuleResult } from './extraction-process';
import { AbstractCleaningRules } from '../abstracts/data-clean-abstracts';

export type CacheFileKey = string;

export function _addEvidence(env: ExtractionEnv, evidence: string, weight: number = 0) {
  const e: ExtractionEvidence = {
    kind: 'evidence',
    evidence,
    weight
  };

  env.evidence.push(e)
}

function removeEvidence(env: ExtractionEnv, regex: RegExp) {
  const filtered = _.filter(env.evidence, (er) => !regex.test(er.evidence));
  env.evidence.splice(0, env.evidence.length, ...filtered);
}


export const addEvidence: <A>(f: (a: A, env: ExtractionEnv) => string) => Arrow<A, A> =
  (f) => tap((a, env) => _addEvidence(env, f(a, env)));

export const clearEvidence: (evidenceTest: RegExp) => Arrow<unknown, unknown> =
  (evidenceTest: RegExp) => compose(
    tap((_a, env) => removeEvidence(env, evidenceTest)),
    tapLeft((_a, env) => removeEvidence(env, evidenceTest)),
  );


function getCurrentEvidenceStrings(env: ExtractionEnv): string[] {
  return _.map(env.evidence, ef => {
    const { evidence, weight } = ef;
    const w =
      weight > 0 ? `::weight=+${weight}` :
        weight < 0 ? `::weight=-${weight}` :
          '';

    return `${evidence}${w}`;
  })
}

function saveFieldRecs(env: ExtractionEnv): void {
  const grouped = _.groupBy(env.fields, (f) => f.name);

  _.each(
    _.toPairs(grouped),
    ([name, fields]) => {
      _.update(
        env.fieldRecs, name,
        (fieldRecs: Field[]) => {
          if (fieldRecs === undefined) {
            return [...fields];
          }
          return _.concat(fieldRecs, fields);
        }
      );
    }
  );
  env.fields.splice(0, env.fields.length);
}

export const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => Arrow<unknown, CacheFileKey[]> =
  (dir, regex) => through((_a, env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath, dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys: CacheFileKey[] = _.map(matching, f => path.join(dir, f));
    return keys;
  }, 'listArtifacts');


export const listResponseBodies = listArtifactFiles('.', /response-body|response-frame/);

export const tidyHtmlTask: (filename: string) => TE.TaskEither<string, string[]> =
  (filepath: string) => {
    const tidyOutputTask = () => runTidyCmdBuffered('./conf/tidy.cfg', filepath)
      .then(([stderr, stdout, _exitCode]) => {
        // Tidy  exit codes = 0: ok, 1: warnings, 2: errors
        const hasStdout = _.some(stdout, line => line.trim().length > 0);
        if (hasStdout) {
          return E.right<string, string[]>(stdout);
        }
        const errString = _.filter(stderr, l => l.trim().length > 0)[0];
        return E.left<string, string[]>(errString);
      });
    return tidyOutputTask;
  };


export const listTidiedHtmls: Arrow<unknown, CacheFileKey[]> =
  through((_z, env) => {
    const { fileContentCache } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKeys = _.map(
      _.toPairs(fileContentCache), ([k]) => k
    );
    return _.filter(cacheKeys, k => k.endsWith(normType));
  });


export const runHtmlTidy: Arrow<string, string> =
  through((artifactPath, env) => {
    const { fileContentCache, entryPath } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKey = `${artifactPath}.${normType}`;
    if (cacheKey in fileContentCache) {
      return ClientFunc.success(cacheKey);
    }
    const maybeCachedContent = readCorpusTextFile(entryPath, 'cache', cacheKey);
    if (maybeCachedContent) {
      fileContentCache[cacheKey] = maybeCachedContent;
      return ClientFunc.success(cacheKey);
    }
    const fullPath = path.resolve(entryPath, artifactPath);

    const maybeTidy: ClientResult<string> = pipe(
      tidyHtmlTask(fullPath),
      TE.map((lines: string[]) => {
        const tidiedContent = lines.join('\n');
        writeCorpusTextFile(entryPath, 'cache', cacheKey, tidiedContent);
        fileContentCache[cacheKey] = tidiedContent;

        return cacheKey;
      }),
      TE.mapLeft((message) => {
        const ci: ControlInstruction = ['halt', message];
        return ci;
      })
    );

    return maybeTidy;
  }, 'runHtmlTidy');

export const verifyFileType: (urlTest: RegExp) => FilterArrow<string> =
  (typeTest: RegExp) => filter((filename, env) => {
    const file = path.resolve(env.entryPath, filename);

    const test = runFileCmd(file).then(a => typeTest.test(a));
    return test;
  }, `/${typeTest.source}/`);

export const readCache: Arrow<CacheFileKey, string> =
  through((cacheKey: CacheFileKey, { fileContentCache }) =>
    cacheKey in fileContentCache ?
      fileContentCache[cacheKey] :
      ClientFunc.halt(`cache has no record for key ${cacheKey}`));


export const grepLines: (regex: RegExp) => Arrow<CacheFileKey, string[]> =
  (regex) => compose(
    readCache,
    through((content: string) => {
      const lines = _.split(content, '\n');
      return _.filter(lines, l => regex.test(l));
    })
  );



export const readGlobalDocumentMetadata: Arrow<CacheFileKey, GlobalDocumentMetadata> = compose(
  grepLines(/^[ ]*global\.document\.metadata/),
  through((lines) => {
    if (lines.length === 0) {
      return ClientFunc.continue('global.document.metadata not found');
    }
    const line = lines[0];
    const jsonStart = line.indexOf('{');
    const jsonEnd = line.lastIndexOf('}');
    const lineJson = line.slice(jsonStart, jsonEnd + 1);
    const globalMetadata: GlobalDocumentMetadata = JSON.parse(lineJson);
    return globalMetadata;
  }));

export const saveDocumentMetaDataAs: (name: string, f: (m: GlobalDocumentMetadata) => string) => Arrow<GlobalDocumentMetadata, unknown> =
  (name, f) => compose(
    addEvidence(() => `global.document.metadata:[${name}]`),
    through((documentMetadata) => f(documentMetadata)),
    saveFieldAs(name),
    clearEvidence(/^global.document.metadata:/),
  );

//////////////////
///// jquery/css selector and Elem functions


export const selectOne: (queryString: string) => Arrow<CacheFileKey, Elem> =
  (queryString) => compose(
    readCache,
    through((content: string, { browser }) => {
      return pipe(
        () => _queryOne(browser, content, queryString),
        TE.mapLeft((msg) => ['continue', `selectElemAttr error: ${msg}`])
      )
    })
  );

export const selectAll: (queryString: string) => Arrow<CacheFileKey, Elem[]> =
  (queryString) => compose(
    readCache,
    through((content: string, { browser }) => {
      return pipe(
        () => _queryAll(browser, content, queryString),
        TE.mapLeft((msg) => ['continue', `selectElemAttr error: ${msg}`])
      )
    })
  );

export const getElemAttr: (attr: string) => Arrow<Elem, string> =
  (attr: string) => through((elem: Elem, { log }) => {

    const attrContent: Promise<E.Either<string, string>> =
      elem.evaluate((e, attrname) => e.getAttribute(attrname), attr)
        .then(text => text === null ?
          E.left(`getElemAttr: no attr content found in elem attr ${attr}`) :
          E.right(text))
        .catch((err) => {
          return E.left(`getElemAttr error ${err}`);
        })

      ;

    return pipe(
      () => attrContent,
      TE.map(sdf => {
        log.info(`getElemAttr(${attr}) => ${sdf}`);
        return sdf;
      }),
      TE.mapLeft(sdf => {
        log.error(`getElemAttr(${attr}) => ${sdf}`);
        return sdf;
      }),
      TE.mapLeft((msg) => ['continue', `getElemAttr error: ${msg}`]),
    );
  });

export const getElemText: Arrow<Elem, string> =
  through((elem: Elem) => {

    const textContent: Promise<E.Either<string, string>> =
      elem.evaluate(e => e.textContent)
        .then(text => text === null ?
          E.left('no text found in elem') :
          E.right(text.trim()));

    return pipe(
      () => textContent,
      TE.mapLeft((msg) => ['continue', `selectElemAttr error: ${msg}`]),
    );
  });

export const matchesText: (regex: RegExp) => FilterArrow<Elem> =
  (regex) => filter(async (elem: Elem) => {
    const textContent = await elem.evaluate(e => e.textContent);
    if (textContent === null) return false;
    return regex.test(textContent);
  });

export const matchesSelector: (query: string) => FilterArrow<Elem> =
  (query) => filter(async (elem: Elem) => {
    const result = await elem.$$(query);
    return result.length > 0;
  });

export const selectElemAttr: (queryString: string, contentAttr: string) => Arrow<CacheFileKey, string> =
  (queryString, contentAttr) => compose(
    readCache,
    through((content: string, { browser }) => {
      return pipe(
        () => _selectElementAttr(browser, content, queryString, contentAttr),
        TE.mapLeft((msg) => ['continue', `selectElemAttr error: ${msg}`])
      )
    })
  );


export const selectElemTextAs: (fieldName: string, queryString: string) => Arrow<CacheFileKey, unknown> =
  (fieldName, queryString) => compose(
    addEvidence(() => `select:$(${queryString}))`),
    selectOne(queryString),
    getElemText,
    saveFieldAs(fieldName),
    clearEvidence(/^select:/),
  );

export const selectElemTextEvidence: (queryString: string) => Arrow<CacheFileKey, unknown> =
  (queryString) => {
    const evidenceName = `select:$(${queryString})`;
    return compose(
      addEvidence(() => evidenceName),
      selectOne(queryString),
      getElemText,
      saveEvidence(evidenceName),
      clearEvidence(/^select:/),
    );
  };

export const selectMetaContentAs: (fieldName: string, name: string, attrName?: string) => Arrow<CacheFileKey, unknown> =
  (fieldName, name, attrName = 'name') => compose(
    addEvidence(() => `select:$(meta[${attrName}="${name}"]).attr('content')`),
    selectElemAttr(expandCaseVariations(name, (s) => `meta[${attrName}="${s}"]`), 'content'),
    saveFieldAs(fieldName),
    clearEvidence(/^select:/),
  );





export const saveEvidence: (evidenceName: string) => Arrow<string, unknown> =
  (evidenceName) => through((extractedValue: string, env) => {
    const candidate: FieldCandidate = {
      text: extractedValue.trim(),
      evidence: getCurrentEvidenceStrings(env),
    }
    env.fieldCandidates.push(candidate);
  }, `saveEvidence:${evidenceName}`);

export const selectMetaEvidence: (name: string, attrName?: string) => Arrow<CacheFileKey, unknown> =
  (name, attrName = 'name') => {
    const evidenceName = `select:$(meta[${attrName}="${name}"])`;
    return compose(
      addEvidence(() => evidenceName),
      selectElemAttr(expandCaseVariations(name, (s) => `meta[${attrName}="${s}"]`), 'content'),
      saveEvidence(evidenceName),
      clearEvidence(/^select:/),
    );
  }

export const selectElemAttrEvidence: (queryString: string, contentAttr: string) => Arrow<CacheFileKey, unknown> =
  (queryString, contentAttr) => {
    const evidenceName = `select:$(${queryString}).attr(${contentAttr})`;
    return compose(
      addEvidence(() => evidenceName),
      selectElemAttr(queryString, contentAttr),
      saveEvidence(evidenceName),
      clearEvidence(/^select:/),
    );
  };


export const selectElemAttrAs: (fieldName: string, queryString: string, contentAttr: string) => Arrow<CacheFileKey, unknown> =
  (fieldName, queryString, contentAttr) => compose(
    addEvidence(() => `select:$(${queryString}).attr(${contentAttr})`),
    selectElemAttr(queryString, contentAttr),
    saveFieldAs(fieldName),
    clearEvidence(/^select:/),
  );

export const selectAllElemAttrAs: (fieldName: string, queryString: string, contentAttr: string) => Arrow<CacheFileKey, unknown> =
  (fieldName, queryString, contentAttr) => compose(
    addEvidence(() => `select-all:$(${queryString}).attr(${contentAttr})`),
    selectAll(queryString),
    forEachDo(compose(
      getElemAttr(contentAttr),
      saveFieldAs(fieldName),
    )),
    clearEvidence(/^select-all:/),
  );


export const selectAllMetaContentAs: (fieldName: string, name: string) => Arrow<CacheFileKey, unknown> =
  (fieldName, name) => compose(
    addEvidence(() => `select-all:$(meta[name="${name}"])`),
    selectAll(expandCaseVariations(name, (s) => `meta[name="${s}"]`)),
    forEachDo(compose(
      getElemAttr('content'),
      saveFieldAs(fieldName),
    )),
    clearEvidence(/^select-all:/),
  );

export const selectAllMetaEvidence: (name: string, attrName?: string) => Arrow<CacheFileKey, unknown> =
  (name, attrName = 'name') => {
    const evidenceName = `select-all:$(meta[${attrName}="${name}"])`;
    return compose(
      addEvidence(() => evidenceName),
      selectAll(expandCaseVariations(name, (s) => `meta[${attrName}="${s}"]`)),
      forEachDo(compose(
        getElemAttr('content'),
        saveEvidence(evidenceName),
      )),
      clearEvidence(/^select-all:/),
    );
  }

///// End jquery/css selector and Elem functions
//////////////////


export const saveFieldAs: (fieldName: string) => Arrow<string, unknown> =
  (fieldName) => through((fieldValue: string, env) => {
    const field: Field = {
      name: fieldName,
      evidence: getCurrentEvidenceStrings(env),
      value: fieldValue.trim()
    };
    const candidate: FieldCandidate = {
      text: fieldValue.trim(),
      evidence: getCurrentEvidenceStrings(env),
    }
    env.fieldCandidates.push(candidate);
    env.fields.push(field);
  }, `saveField:${fieldName}`);



export const urlMatcher: (urlTest: RegExp) => Arrow<unknown, unknown> =
  (regex) => compose(
    through((_a, env) => env.metadata.responseUrl),
    filter((a) => regex.test(a), `/${regex.source}/`),
  );

export const statusFilter: Arrow<unknown, unknown> =
  compose(
    through((_a, env) => env.metadata.status),
    filter((a) => a === '200', 'status=200'),
    tapLeft((sdf) => {
      console.log('statusFilter left', sdf);
    })
  );

export const normalizeHtmls: Arrow<unknown, string[]> =
  compose(
    listResponseBodies,
    forEachDo(
      compose(
        verifyFileType(/html|xml/i),
        runHtmlTidy,
      )
    ),
  );

export const urlFilter: (urlTest: RegExp) => Arrow<unknown, string[]> =
  (regex) => compose(
    urlMatcher(regex),
    statusFilter,
    normalizeHtmls,
  );

export const forInputs: (re: RegExp, arrow: Arrow<string, unknown>) => Arrow<unknown, unknown> =
  (re, arrow) => compose(
    listTidiedHtmls,
    through((inputs) => _.filter(inputs, input => re.test(input))),
    forEachDo(
      compose(
        log('info', a => `processing input ${a}`),
        addEvidence((a) => `input:${a}`),
        arrow,
        clearEvidence(/^input:/),
      )
    )
  );

export const forEachInput: (arrow: Arrow<string, unknown>) => Arrow<string[], unknown> =
  (arrow) => compose(
    listTidiedHtmls,
    forEachDo(
      compose(
        log('info', a => `processing input ${a}`),
        addEvidence((a) => `input:${a}`),
        arrow,
        tap((_a, env) => saveFieldRecs(env), 'collect-fields'),
        clearEvidence(/^input:/),
      )
    )
  );

// export const givenEvidence()
// givenEvidence(exists('citation_author'))
// similar(textFor('og:description'), textFor('.abstract'))

export const tryEvidenceMapping: (mapping: Record<string, string>) => Arrow<unknown, unknown> =
  (mapping) => {
    const evidenceKeys = _.keys(mapping);
    const filters = _.map(evidenceKeys, e => evidenceExists(e))
    const keyEvidence = _.join(evidenceKeys, ' ++ ');

    return compose(
      composeSeries(...filters),
      tap((_a, env) => {
        _.each(evidenceKeys, k => {
          const fieldName = mapping[k];
          const maybeCandidates = candidatesForEvidence(env, fieldName);
          _.each(maybeCandidates, c => {
            const { text, evidence } = c;
            const field: Field = {
              name: fieldName,
              evidence: [...evidence],
              value: text
            };
            field.evidence.push(keyEvidence);
            env.fields.push(field);
          });
        });
        saveFieldRecs(env);
      }),
    )
  };

export const candidatesForEvidence: (env: ExtractionEnv, evstr: string) => FieldCandidate[] =
  (env, evstr) => {
    const regex = new RegExp(evstr);
    return _.filter(env.fieldCandidates, (fc) => {
      return _.some(fc.evidence, ev => regex.test(ev));
    });
  };

export const textForEvidence: (env: ExtractionEnv, evstr: string) => string | undefined =
  (env, evstr) => {
    const regex = new RegExp(evstr);
    const maybeCandidate = _.find(env.fieldCandidates, (fc) => {
      return _.some(fc.evidence, ev => regex.test(ev));
    });

    return maybeCandidate ? maybeCandidate.text : undefined;
  };

export const evidenceExists: (evstr: string) => FilterArrow<unknown> =
  (evstr) => filter((_a, env) => {
    const regex = new RegExp(evstr);
    return _.some(
      env.fieldCandidates, (fc) => {
        return _.some(fc.evidence, ev => regex.test(ev));
      }
    );
  });

export const summarizeEvidence: Arrow<unknown, unknown> = tap((_a, env) => {
  const { fieldCandidates, fields, log } = env
  const url = env.metadata.responseUrl;

  log.log('info', `summary: URL= ${url}`);

  _.each(fieldCandidates, fc => {
    log.log('info', `summary:     ${fc.text}`);
    _.each(fc.evidence, ev => {
      log.log('info', `summary:         ${ev}`);
    });
  });

  // log.log('info', 'summary: Fields');
  // _.each(fields, (field) => {
  //   const { name, value, evidence } = field;
  //   log.log('info', `summary:      ${name} ==> ${value}`);
  //   _.each(evidence, ev => {
  //     log.log('info', `summary:          ${ev}`);
  //   });
  // });

  log.log('info', 'summary: Field Records');
  const nameValuePairs = _.toPairs(env.fieldRecs)
  _.each(nameValuePairs, ([name, fields]) => {
    env.log.log('info', `summary:     Field: ${name}  count=${fields.length}`);
    _.each(fields, field => {
      const { name, value, evidence } = field;
      log.log('info', `summary:        ${name} ==> ${value}`);
      _.each(evidence, ev => {
        log.log('info', `summary:            ${ev}`);
      });
    })
  });
  log.log('info', 'summary: ');
});

export const summarizeExtraction: Arrow<unknown, unknown> = tap((_a, env) => {
  const nameValuePairs = _.toPairs(env.fieldRecs)
  const fieldNames = _.map(nameValuePairs, ([name]) => name);
  const url = env.metadata.responseUrl;
  const parsedUrl = parseUrl(url);
  const { host } = parsedUrl;
  let { pathname } = parsedUrl;
  if (pathname.startsWith('/')) pathname = pathname.slice(1);
  const paths = pathname.split('/');
  const pathButLast = paths.slice(0, paths.length - 1);
  const pathBL = _.join(pathButLast, '/');
  env.log.log('info', `summary: url       : ${url}`);
  env.log.log('info', `summary: host      : ${host}`);
  env.log.log('info', `summary: path-1    : ${pathBL}`);
  env.log.log('info', `summary: fields    : ${_.join(fieldNames, ', ')}`);
  _.each(nameValuePairs, ([name, fields]) => {
    env.log.log('info', `summary:     field: ${name}  count=${fields.length}`);
    _.each(fields, field => {
      const evidence = _.join(field.evidence, ' ++ ');
      env.log.log('info', `summary:      value   : ${field.value} `);
      env.log.log('info', `summary:      evidence: ${evidence} `);
    })
  });
});

export const dedupFields: Arrow<unknown, unknown> = tap((_a, env) => {
  const nameValuePairs = _.toPairs(env.fieldRecs)
  _.each(nameValuePairs, ([name, fields]) => {
    const hashedFields = _.map(fields, f => {
      const checksum = f.value ? shaEncodeAsHex(f.value) : '';
      return [checksum, f] as const;
    })
    const uniq = _.uniqBy(hashedFields, ([csum,]) => csum)
    const uniqFields = _.map(uniq, ([, f]) => f);
    env.fieldRecs[name].splice(0, env.fieldRecs[name].length, ...uniqFields);
  });
});


export function applyCleaningRules(rules: CleaningRule[], initialString: string): [string, CleaningRuleResult[]] {
  let currentString = initialString;
  const cleaningResults: CleaningRuleResult[] = [];
  _.each(rules, (rule) => {
    const someGuardMatches = (
      rule.guards.length === 0
      || rule.guards.some(re => re.test(currentString))
    );

    if (!someGuardMatches) return;

    const cleaned = rule.run(currentString, rule.guards);
    if (cleaned === undefined) return;
    if (cleaned !== currentString) {
      const changes = diffByChars(currentString, cleaned, { brief: true });
      cleaningResults.push({
        rule: rule.name,
        changes,
      });
      currentString = cleaned;
    }
  });
  return [currentString, cleaningResults];
}

export const cleanFields: Arrow<unknown, unknown> = tap((_a, env) => {
  const nameValuePairs = _.toPairs(env.fieldRecs)
  _.each(nameValuePairs, ([name, fields]) => {
    if (name === 'abstract') {
      _.each(fields, field => {
        const fieldValue = field.value;
        let cleaned: string | undefined;
        if (fieldValue) {
          const [cleaned0, cleaningRuleResults] = applyCleaningRules(AbstractCleaningRules, fieldValue);
          const ruleNames = _.map(cleaningRuleResults, r => {
            return `clean: ${r.rule}`;
          })
          cleaned = cleaned0;
          field.evidence.push(...ruleNames);
          const fvTrimmed = fieldValue.trim();
          // an axiomatic...
          const isClipped = fvTrimmed.endsWith('...') || fvTrimmed.endsWith('…');
          if (isClipped) {
            env.log.log('info', 'clipping abstract ...');
            field.name = 'abstract-clipped';
          }
        }

        if (cleaned && cleaned.length > 0) {
          field.value = cleaned;
        } else {
          field.value = undefined;
        }
      })
    }
  });
});


export interface ExtractContext {
  log: Logger;
}


// and(url~/arxiv.org/, select~/og:description/).implies 'abstract'
// metaTags.names includesAll [citation_title, citation_author, ]
// when(all(haveEvidence(  .abstractInFull, DC.Description, og:description )))(
//
// )
//       and  textFor(.abstractInFull) hasClippedVersion == textFor(DC.Description)
//       then og:description => Title
//            DC.Description => abstract:clipped
//            abstractInFull => abstract


export async function initExtractionEnv(
  entryPath: string,
  ctx: ExtractContext,
  metadata: Metadata,
): Promise<ExtractionEnv> {
  const { log } = ctx;

  const pathPrefix = path.basename(entryPath).slice(0, 6);
  const logPrefix = [pathPrefix];

  const browser = await puppeteer
    .launch({ headless: true });

  const env: ExtractionEnv = {
    log,
    browser,
    ns: logPrefix,
    entryPath,
    metadata,
    fields: [],
    fieldRecs: {},
    fieldCandidates: [],
    evidence: [],
    fileContentCache: {},
    enterNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    },
    exitNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    }
  };
  return env;
}
