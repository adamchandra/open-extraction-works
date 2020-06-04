import _, { Dictionary } from "lodash";

import {
  ExpandedDir,
} from "commons";

import { BufferedLogger, } from "commons";
import { gatherAbstractFiles } from "~/corpora/bundler";
import { Field } from "~/extract/field-extract";
import { UrlGraph, InputRec } from '~/openreview/workflow';
import { writeDefaultEntryLogs } from '~/qa-editing/qa-logging';
import { runInteractive } from '~/qa-editing/qa-interactive';

export interface ReviewEnv {
  logger: BufferedLogger;
  interactive: boolean;
  urlGraph: UrlGraph;
  csvLookup: Dictionary<InputRec>;
}

export async function cleanExtractedAbstract(entryDir: ExpandedDir, env: ReviewEnv): Promise<void> {
  const { logger } = env;
  logger.append(`action=cleanExtractedAbstract`);
  writeDefaultEntryLogs(logger, entryDir, env);
  if (env.interactive) {
    await cleanAbstractInteractive(logger, entryDir);
  } else {
    await cleanAbstractNonInteractive(logger, entryDir, env);
  }
  logger.commitLogs();
  return;
}

export interface CleaningRule {
  name: string;
  precondition(str: string): boolean;
  run(str: string): string;

}
const CleaningRules: CleaningRule[] = [
  {
    name: "starts w/'abstract'",
    precondition: (str) => {
      const strim = str.trim();
      return (/^abstract/i).test(strim);
    },
    run: (str) => {
      const strim = str.trim();
      return strim.replace(/^abstract */i, "");
    }
  },

  {
    name: "clip @ 'References'",
    precondition: (str) => {
      const regex = /(References|REFERENCES)/;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /(References|REFERENCES).*$/;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },

  {
    name: "clip @ 'Keywords'",
    precondition: (str) => {
      const regex = /(Keywords)/;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /(Keywords).*$/;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },

  {
    name: "starts w/non-word",
    precondition: (str) => {
      const strim = str.trim();
      return (/^\W+/i).test(strim);
    },
    run: (str) => {
      const strim = str.trim();
      return strim.replace(/^\W+/i, "");
    }
  },

  {
    name: "clip @ Cite This Paper",
    precondition: (str) => {
      const regex = /Cite This Paper Abstract/i;
      return regex.test(str);
    },
    run: (str) => {
      const regex = /Cite This Paper Abstract/i;
      let [, post] = str.split(regex);
      post = post? post.trim() : '';
      return post;
    }
  },

  {
    name: "clip @ Disqus comments",
    precondition: (str) => {
      const regex = /Comments[\d ]+Comments.*$/i;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /Comments[\d ]+Comments.*$/i;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },
  {
    name: "clip @ trailing tags <.. />",
    precondition: (str) => {
      const regex = /<ETX.*$/i;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /<ETX.*$/i;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },
  {
    name: "clip @ trailing <",
    precondition: (str) => {
      const regex = /<$/i;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /<$/i;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },
  {
    name: "trim extra space",
    precondition: (str) => {
      const regex = /[ ][ ]+/g;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /[ ]+/g;
      const strim = str.trim();
      return strim.replace(regex, " ");
    }
  },
  {
    name: "remove newlines",
    precondition: () => {
      return true;
    },
    run: (str) => {
      return str.split('\n').join(' ');
    }
  },
 
  {
    name: "abstract too short",
    precondition: (str) => {
      return str.length < 200;
    },
    run: () => ''
  },

  {
    name: "clip @ 'Full Text: PDF'",
    precondition: (str) => {
      const regex = /(Full Text:).*$/;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /(Full Text:).*$/;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },
  {
    name: "clip @ 'Related Material'",
    precondition: (str) => {
      const regex = /Related Material/;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /Related Material.*$/;
      const strim = str.trim();
      return strim.replace(regex, "");
    }
  },

  {
    name: "clip before /Graphical abstract Download/",
    precondition: (str) => {
      const regex = /Graphical abstract Download/i;
      return regex.test(str);
    },
    run: (str) => {
      const regex = /Graphical abstract Download/i;
      let [pre,] = str.split(regex);
      pre = pre? pre.trim() : '';
      return pre;
    }
  },

  {
    name: "Catch-alls: e.g., /^Home Page Papers|^Complexity/..",
    precondition: (str) => {
      const regexes = [
        /Home Page Papers/i,
        /Complexity . Journal Menu/,
        /no abstract available/i,
        /^Download.Article/i,
        /Open Access Article/i,
        /For authors For reviewers/,
        /Banner art adapted from/i,
        /a collection of accepted abstracts/i,
      ];
      const strim = str.trim();
      return regexes.some(re => re.test(strim));
    },
    run: () => {
      return '';
    }
  },
  {
    name: "/Home Archives/ >> maybe /Abstract.*/",
    precondition: (str) => {
      const regex = /^Home Archives/;
      const strim = str.trim();
      return regex.test(strim);
    },
    run: (str) => {
      const regex = /Abstract/;
      let [, post] = str.split(regex);
      post = post? post.trim() : '';
      return post;
    }
  },
];

type TupleSSN = readonly [string, string, number];

async function cleanAbstractInteractive(logger: BufferedLogger, entryDir: ExpandedDir): Promise<void> {
  const abstractFilesWithFields: Array<[string, Field[]]> =
    gatherAbstractFiles(entryDir);

  const abstractStrs: Array<TupleSSN> =
    _(abstractFilesWithFields)
      .flatMap(([filename, fields]) => {
        return _.map(fields, (f, i) => [filename, f.value, i] as TupleSSN)
          .filter(([, v]) => v !== undefined);
      })
      .map(([fn, f, i]) => [fn, f ? f.trim() : "", i] as TupleSSN)
      .value();

  if (abstractStrs.length > 0) {
    const [, abs] = abstractStrs[0];
    return runInteractive({ abstractStr: abs, cleaningRules: CleaningRules, logger });
  }
}

export async function cleanAbstractNonInteractive(logger: BufferedLogger, entryDir: ExpandedDir, env: ReviewEnv): Promise<void> {
  const abstractFilesWithFields: Array<[string, Field[]]> =
    gatherAbstractFiles(entryDir);

  const abstractStrs: Array<TupleSSN> =
    _(abstractFilesWithFields)
      .flatMap(([filename, fields]) => {
        // console.log('cleanAbstractNonInteractive', entryDir.dir, fields);
        return _.map(fields, (f, i) => [filename, f.value, i] as TupleSSN)
          .filter(([, v]) => v !== undefined);
      })
      .map(([fn, f, i]) => {
        // console.log('cleanAbstractNonInteractive(2)', fn, f);
        const cleaned = applyCleaningRules(f ? f.trim() : "");
        return [fn, cleaned, i] as TupleSSN;
      })
      .filter(([, f,]) => f !== undefined && f.length > 0)
      .value();

  if (abstractStrs.length > 0) {
    const abs = abstractStrs[0][1];
    logger.append(`field.abstract.value=${abs}`);
  } else {
    logger.append(`field.abstract.skipped=true`);
    console.log(`abstract skipped: ${entryDir.dir}`);
  }
}

function applyCleaningRules(abstractStr: string): string {
  let cleanedAbs = abstractStr;
  _.each(CleaningRules, (rule) => {
    if (rule.precondition(cleanedAbs)) {
      cleanedAbs = rule.run(cleanedAbs);
    }
  });
  return cleanedAbs.trim();
}
