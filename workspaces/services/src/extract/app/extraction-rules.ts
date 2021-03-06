import _ from 'lodash';

import { flow as fpflow, pipe } from 'fp-ts/function'

import {
  gatherSuccess,
  takeFirstSuccess,
  log,
  filter,
} from './extraction-prelude';

import {
  clearEvidence,
  forInputs,
  normalizeHtmls,
  selectAllMetaEvidence,
  selectElemAttrEvidence,
  selectElemTextEvidence,
  selectGlobalDocumentMetaEvidence,
  selectMetaEvidence,
  statusFilter,
  summarizeEvidence,
  tryEvidenceMapping,
  urlFilter,
  _addEvidence,
  tapEnvLR,
  selectAllElemAttrEvidence,
} from './extraction-process';

import parseUrl from 'url-parse';

// <A extends readonly unknown[]>
const compose: typeof fpflow = (...fs: []) => <A extends readonly unknown[]>(a: A) => pipe(a, ...fs);

export const checkStatusAndNormalize = compose(
  log('info', (_0, env) => `Processing ${env.metadata.responseUrl}`),
  statusFilter,
  normalizeHtmls,
  filter((a) => a.length > 0),
)

export const addUrlEvidence = tapEnvLR((env) => {
  const parsedUrl = parseUrl(env.metadata.responseUrl);
  const { host } = parsedUrl;
  const paths = parsedUrl.pathname.split('/');
  const [, p1, p2] = paths.slice(0, paths.length - 1);
  _addEvidence(env, `url:host:${host}`);
  if (p1 !== undefined) {
    _addEvidence(env, `url:path1:${p1}`);
  }
  if (p2 !== undefined) {
    _addEvidence(env, `url:path2:${p2}`);
  }
});


export const gatherHighwirePressTags = gatherSuccess(
  selectMetaEvidence('citation_title'),
  selectMetaEvidence('citation_date'),
  selectMetaEvidence('citation_pdf_url'),
  selectMetaEvidence('citation_abstract'),
  selectAllMetaEvidence('citation_author'),
);

export const gatherOpenGraphTags = gatherSuccess(
  selectMetaEvidence('og:url'),
  selectMetaEvidence('og:url', 'property'),
  selectMetaEvidence('og:title'),
  selectMetaEvidence('og:title', 'property'),
  selectMetaEvidence('og:type'),
  selectMetaEvidence('og:type', 'property'),
  selectMetaEvidence('og:description'),
  selectMetaEvidence('og:description', 'property'),
);

export const gatherDublinCoreTags = gatherSuccess(
  selectMetaEvidence('DC.Description'),
  selectMetaEvidence('DC.Title'),
  selectAllMetaEvidence('DC.Creator'),
  selectAllMetaEvidence('DC.Subject'),
  selectAllMetaEvidence('DC.Identifier'),
  selectAllMetaEvidence('DC.Type'),
);

export const gatherSchemaEvidence = forInputs(
  /response-body/,
  gatherSuccess(
    gatherHighwirePressTags,
    gatherOpenGraphTags,
    gatherDublinCoreTags,

    selectMetaEvidence('description'),
    selectElemTextEvidence('.abstract'),
    selectElemTextEvidence('#abstract'),
    selectElemTextEvidence('#Abstracts'),
    selectElemTextEvidence('.abstractInFull'),
  ),
);

export const UrlSpecificAttempts = takeFirstSuccess(
  compose(
    urlFilter(/ieeexplore.ieee.org/),
    forInputs(/response-body/, compose(
      selectGlobalDocumentMetaEvidence(),
      tryEvidenceMapping({
        'metadata:title': 'title',
        'metadata:abstract': 'abstract',
        'metadata:author': 'author',
        'metadata:pdf-path': 'pdf-path',
      }),
    )),
  ),
  compose(
    urlFilter(/arxiv.org/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherHighwirePressTags,
        gatherOpenGraphTags,
      ),
      tryEvidenceMapping({
        'citation_title': 'title',
        'og:description': 'abstract',
        'citation_author': 'author',
        'citation_pdf_url': 'pdf-link',
      }),
    )),
  ),
  compose(
    urlFilter(/sciencedirect.com/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherHighwirePressTags,
        gatherOpenGraphTags,
        selectElemTextEvidence('.Abstracts'),
        selectElemTextEvidence('a.author'), // TODO selectAll??
        selectElemAttrEvidence('div.PdfEmbed a.anchor', 'href'),
      ),
      tryEvidenceMapping({
        'citation_title': 'title',
        'og:description': 'abstract-clipped',
        '.Abstracts': 'abstract:raw',
        'a.author': 'author',
        'div.PdfEmbed?': 'pdf-path',
      }),
    )),
  ),
  compose(
    urlFilter(/link.springer.com/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherHighwirePressTags,
        gatherOpenGraphTags,
        selectElemTextEvidence('section#Abs1 > p.Para'),
      ),
      takeFirstSuccess(
        compose(
          urlFilter(/\/chapter\//),
          tryEvidenceMapping({ // link.springer.com/chapter
            'citation_title': 'title',
            'citation_author': 'author',
            'citation_pdf_url': 'pdf-link',
            'og:description': 'abstract-clipped',
            'section#Abs1 > p.Para': 'abstract',
          }),
        ),
        compose(
          urlFilter(/\/article\//),
          tryEvidenceMapping({ // link.springer.com/article
            'citation_title': 'title',
            'citation_author': 'author',
            'citation_pdf_url': 'pdf-link',
            'og:description': 'abstract',
          }),
        ),
      )
    )),
  ),

  compose(
    urlFilter(/dl.acm.org/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherDublinCoreTags,
        selectElemTextEvidence('.citation__title'),
        selectElemTextEvidence('.abstractInFull'),
        selectAllElemAttrEvidence('a[class="author-name"]', 'title'),
        selectElemAttrEvidence('a[title="PDF"]', 'href'),
      ),
      tryEvidenceMapping({
        'DC.Title?': 'title',
        'citation__title?': 'title',
        'abstractInFull': 'abstract',
        'author-name': 'author',
        'PDF': 'pdf-path',
      }),
    )),
  ),

  compose(
    urlFilter(/aclweb.org/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherHighwirePressTags,
        selectElemTextEvidence('.acl-abstract'),
      ),
      tryEvidenceMapping({
        'citation_title': 'title',
        'citation_author': 'author',
        'citation_pdf_url': 'pdf-link',
        'acl-abstract': 'abstract:raw',
      }),
    )),
  ),

  compose(
    urlFilter(/mitpressjournals.org/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherDublinCoreTags,
        selectElemAttrEvidence('a[class="show-pdf"]', 'href'),
        selectElemTextEvidence('.abstractInFull'),
      ),
      tryEvidenceMapping({
        'DC.Title': 'title',
        'DC.Creator': 'author',
        'abstractInFull': 'abstract:raw',
        'show-pdf': 'pdf-link',
      }),
    )),
  ),
  compose(
    urlFilter(/academic.oup.com/),
    forInputs(/response-body/, compose(
      gatherSuccess(
        gatherHighwirePressTags,
        selectElemTextEvidence('section[class="abstract"] p[class="chapter-para"]'),
      ),
      tryEvidenceMapping({
        'citation_title': 'title',
        'citation_author': 'author',
        'citation_pdf_url': 'pdf-link',
        'abstract': 'abstract:raw',
      }),
    )),
  ),
);


export const AbstractFieldAttempts = compose(
  checkStatusAndNormalize,

  takeFirstSuccess(
    UrlSpecificAttempts,
    // Url non-specific attempts
    compose(
      addUrlEvidence,
      gatherSchemaEvidence,
      clearEvidence(/^url:/),
      filter(() => false, 'always fail') // <<- takeFirstSuccess stops at first successful function, so we must fail to continue
    ),
    tryEvidenceMapping({
      'citation_title': 'title',
      'citation_author': 'author',
      'citation_pdf_url': 'pdf-link',
      'DC.Description|og:description': 'abstract',
    }),
    tryEvidenceMapping({
      'citation_title|DC.Title': 'title',
      'citation_author|DC.Creator': 'author',
      'citation_pdf_url?': 'pdf-link',
      '\\.abstractInFull|\\.abstract|#abstract': 'abstract:raw',
    }),
    tryEvidenceMapping({
      'og:title': 'title',
      'og:description': 'abstract',
    }),
  ),
  summarizeEvidence,
)
