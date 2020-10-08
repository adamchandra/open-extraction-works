import _ from 'lodash';

import { flow as compose } from 'fp-ts/function'

import {
  applyAll,
  attemptSeries,
  log,
  tap,
  tapLeft,
  filter,
} from './extraction-prelude';

import {
  forEachInput,
  forInputs,
  normalizeHtmls,
  readGlobalDocumentMetadata,
  saveDocumentMetaDataAs,
  selectAllMetaContentAs,
  selectAllMetaEvidence,
  selectElemAttrAs,
  selectElemAttrEvidence,
  selectElemTextAs,
  selectElemTextEvidence,
  selectMetaContentAs,
  selectMetaEvidence,
  statusFilter,
  summarizeEvidence,
  summarizeExtraction,
  tryEvidenceMapping,
  urlFilter,
  _addEvidence
} from './extraction-process-v2';


export const FieldExtractionPipeline = attemptSeries(
  compose(
    urlFilter(/arxiv.org/), // TODO make logging for pass/fail noisy or quiet
    // maybe select particular response body/frame, rather that processing all of them
    // through((responseBodies) => _.filter(responseBodies, rb => rb === 'response-frame-0') )
    forEachInput(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        selectAllMetaContentAs('author', 'citation_author'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectMetaContentAs('abstract', 'og:description'), // TODO fix: name= vs property=
      ),
    ),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/sciencedirect.com\/science/),
    forEachInput(compose(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        // Author : TODO pick up embedded json
        selectElemAttrAs('pdf-link', 'div.PdfEmbed a.anchor', 'href'),
        selectElemAttrAs('abstract-clipped', 'meta[property="og:description"]', 'content'),
        selectElemTextAs('abstract', 'div#abstracts > div.abstract > div'),
      )
    )),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/content.iospress.com/),
    forEachInput(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        selectAllMetaContentAs('author', 'citation_author'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
      )
    ),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/link.springer.com\/article/),
    forEachInput(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        selectAllMetaContentAs('author', 'citation_author'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract-clipped', 'meta[name=description]', 'content'),
        selectElemAttrAs('abstract', 'meta[name="dc.description"]', 'content'),
      )
    ),
    summarizeExtraction,
  ),
  compose(
    urlFilter(/link.springer.com\/chapter/),
    forEachInput(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        selectAllMetaContentAs('author', 'citation_author'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract-clipped', 'meta[name=description]', 'content'),
        selectElemTextAs('abstract', 'section#abs1 > p.para'),
      )
    ),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/proceedings.mlr.press/),
    forEachInput(compose(
      applyAll(
        selectMetaContentAs('title', 'citation_title'),
        selectAllMetaContentAs('author', 'citation_author'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract-clipped', 'meta[property="og:description"]', 'content'),
        selectElemTextAs('abstract', 'div#abstract.abstract'),
      )
    )),
    summarizeExtraction,
  ),
  compose(
    urlFilter(/ieeexplore.ieee.org/),
    forEachInput(compose(
      readGlobalDocumentMetadata,
      applyAll(
        saveDocumentMetaDataAs('title', m => m.title),
        saveDocumentMetaDataAs('abstract', m => m.abstract),
        saveDocumentMetaDataAs('pdf-path', m => m.pdfPath),
      )
    )),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/mitpressjournals.org/),
    forEachInput(compose(
      applyAll(
        selectMetaContentAs('title', 'DC.Title'),
        selectAllMetaContentAs('author', 'DC.Creator'),
        selectElemAttrAs('pdf-link', 'a.show-pdf', 'href'),
        selectMetaContentAs('abstract-clipped', 'DC.Description'),
        selectElemTextAs('abstract', 'div.abstractInFull'),
      )
    )),
    summarizeExtraction,
  ),

  compose(
    urlFilter(/dl\.acm\.org/),
    forEachInput(compose(
      applyAll(
        selectMetaContentAs('title', 'DC.Title'),
        selectAllMetaContentAs('author', 'DC.Creator'),
        selectElemAttrAs('pdf-link', 'li.pdf-file > a', 'href'),
        selectMetaContentAs('abstract-clipped', 'DC.Description'),
        selectElemTextAs('abstract', 'div.abstractInFull'),
      )
    )),
    summarizeExtraction,
  ),

  compose(
    log('warn', (_a, env) => `no rules matched ${env.metadata.responseUrl}`),
    summarizeExtraction,
  )
);

export const TitleFieldAttempts = attemptSeries(
  forEachInput(
    applyAll(
      selectMetaContentAs('title', 'citation_title'),
      selectMetaContentAs('title', 'DC.Title'),
    ),
  ),
);

import parseUrl from 'url-parse';

export const gatherFieldEvidence = compose(
  forInputs(
    /response-body/,
    applyAll(
      selectMetaEvidence('og:description'),
      selectMetaEvidence('og:description', 'property'),
      selectMetaEvidence('description'),
      selectMetaEvidence('DC.Description'),
      selectElemAttrEvidence('h1[data-abstract]', 'data-abstract'),
      selectElemTextEvidence('section#Abs1 > p.Para'),
      selectElemTextEvidence('.abstract'),
      selectElemTextEvidence('#abstract'),
      selectElemTextEvidence('.Abstracts'),
      selectElemTextEvidence('#Abstracts'),
      selectElemTextEvidence('.abstractInFull'),
    ),
  ),
  forInputs(
    /response-body/,
    applyAll(
      selectMetaEvidence('citation_title'),
      selectMetaEvidence('DC.Title'),
    ),
  ),
  forInputs(
    /response-body/,
    applyAll(
      selectMetaEvidence('citation_pdf_url'),
      selectElemAttrEvidence('div.PdfEmbed a.anchor', 'href'),
      selectElemAttrEvidence('a.show-pdf', 'href'),
      selectElemAttrEvidence('li.pdf-file > a', 'href'),
    ),
  ),
  forInputs(
    /response-body/,
    applyAll(
      selectAllMetaEvidence('citation_author'),
      selectAllMetaEvidence('DC.Creator'),
    ),
  ),
);

export const checkStatusAndNormalize = compose(
  log('info', (_0, env) => `${env.metadata.responseUrl}`),
  statusFilter,
  normalizeHtmls,
  filter((a) => a.length > 0),
)

export const addUrlEvidence = tap((_0, env) => {
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

export const AbstractFieldAttempts = compose(
  checkStatusAndNormalize,
  addUrlEvidence,
  gatherFieldEvidence,
  tapLeft((sdf) => {
    console.log('after gatherFieldEvidence', sdf);
  }),
  attemptSeries(
    tryEvidenceMapping({
      'citation_title': 'title',
      'og:description': 'abstract',
      'citation_author': 'author',
      'citation_pdf_url': 'pdf-link',
    }),
    tryEvidenceMapping({
      'citation_title': 'title',
      'section#Abs1 > p.Para': 'abstract',
      'og:description': 'abstract-clipped',
      'description': 'abstract-clipped',
      'citation_author': 'author',
      'citation_pdf_url': 'pdf-link',
    }),
    tryEvidenceMapping({
      'og:description': 'title',
      'DC.Title': 'title',
      'abstractInFull': 'abstract',
      'DC.Description': 'abstract-clipped',
      'DC.Creator': 'author',
      'a.show-pdf': 'pdf-link',
    }),
  ),
  tapLeft((sdf) => {
    console.log('after attemptSeries', sdf);
  }),
  summarizeEvidence,
)
