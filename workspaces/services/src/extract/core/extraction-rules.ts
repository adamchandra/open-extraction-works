import _ from 'lodash';

import { flow as compose } from 'fp-ts/function'

import {
  applyAll,
  attemptSeries,
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
} from './extraction-process-v2';

import parseUrl from 'url-parse';

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


export const gatherHighwirePressTags = applyAll(
  selectMetaEvidence('citation_title'),
  selectMetaEvidence('citation_date'),
  selectMetaEvidence('citation_pdf_url'),
  selectMetaEvidence('citation_abstract'),
  selectAllMetaEvidence('citation_author'),
);

export const gatherOpenGraphTags = applyAll(
  selectMetaEvidence('og:url'),
  selectMetaEvidence('og:url', 'property'),
  selectMetaEvidence('og:title'),
  selectMetaEvidence('og:title', 'property'),
  selectMetaEvidence('og:type'),
  selectMetaEvidence('og:type', 'property'),
  selectMetaEvidence('og:description'),
  selectMetaEvidence('og:description', 'property'),
);

export const gatherDublinCoreTags = applyAll(
  selectMetaEvidence('DC.Description'),
  selectMetaEvidence('DC.Title'),
  selectAllMetaEvidence('DC.Creator'),
  selectAllMetaEvidence('DC.Subject'),
  selectAllMetaEvidence('DC.Identifier'),
  selectAllMetaEvidence('DC.Type'),
);

export const gatherSchemaEvidence = forInputs(
  /response-body/,
  applyAll(
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

export const UrlSpecificAttempts = attemptSeries(
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
      applyAll(
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
      applyAll(
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
      applyAll(
        gatherHighwirePressTags,
        gatherOpenGraphTags,
        selectElemTextEvidence('section#Abs1 > p.Para'),
      ),
      attemptSeries(
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
      applyAll(
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
      applyAll(
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
      applyAll(
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
);



export const AbstractFieldAttempts = compose(
  checkStatusAndNormalize,

  attemptSeries(
    UrlSpecificAttempts,
    // Url non-specific attempts
    compose(
      addUrlEvidence,
      gatherSchemaEvidence,
      clearEvidence(/^url:/),
      filter(() => false, 'always fail') // <<- attemptSeries stops at first successful function, so we must fail to continue
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
    // TODO trim Abstract: Motivation ...
  ),
  summarizeEvidence,
)
