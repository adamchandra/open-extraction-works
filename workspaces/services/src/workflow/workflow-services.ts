import _ from 'lodash';

import { CanonicalFieldRecords, extractFieldsForEntry, getCanonicalFieldRecord } from '~/extract/run-main';
import * as winston from 'winston';

import { AlphaRecord, getCorpusEntryDirForUrl } from 'commons';

import { createSpiderService, SpiderService } from './spider-service';
import { commitMetadata, commitUrlStatus, DatabaseContext, getNextUrlForSpidering, getUrlStatus, insertAlphaRecords, insertNewUrlChains } from '~/db/db-api';
import { getServiceLogger } from '~/utils/basic-logging';
import { Metadata } from 'spider';

export interface WorkflowServices {
  log: winston.Logger;
  spiderService: SpiderService;
  dbCtx: DatabaseContext;
}

interface ErrorRecord {
  error: string;
}

const ErrorRecord = (error: string): ErrorRecord =>
  ({ error });

export function getCanonicalFieldRecs(alphaRec: AlphaRecord): CanonicalFieldRecords | undefined {
  const { url } = alphaRec;
  const entryPath = getCorpusEntryDirForUrl(url);
  const fieldRecs = getCanonicalFieldRecord(entryPath);
  if (fieldRecs === undefined) {
    return;
  }
  fieldRecs.noteId = alphaRec.noteId;
  fieldRecs.title = alphaRec.title;
  fieldRecs.url = alphaRec.url;
  return fieldRecs;
}

export async function fetchOneRecord(
  dbCtx: DatabaseContext,
  services: WorkflowServices,
  alphaRec: AlphaRecord,
): Promise<CanonicalFieldRecords | ErrorRecord> {

  const { log } = services;
  const { url } = alphaRec;

  log.info(`Fetching fields for ${url}`);
  const insertedAlphaRecs = await insertAlphaRecords(dbCtx, [alphaRec]);
  log.info(`inserted ${insertedAlphaRecs.length} new alpha records`);

  const newUrlCount = await insertNewUrlChains(dbCtx);
  log.info(`inserted ${newUrlCount} new URL records`);

  const urlStatus = await getUrlStatus(dbCtx, url);
  if (urlStatus === undefined) {
    return ErrorRecord('Error inserting records into database');
  }

  log.info(`URL Status: ${urlStatus.status_code}: ${urlStatus.status_message}`);

  // First attempt: if we have the data on disk, just return it
  let fieldRecs = getCanonicalFieldRecs(alphaRec);

  if (fieldRecs === undefined) {
    // Try to spider/extract
    log.info(`No extracted fields found.. spidering ${url}`);
    const metadataOrError = await scrapeUrl(dbCtx, services, url);
    if ('error' in metadataOrError) {
      const { error } = metadataOrError;
      await commitUrlStatus(dbCtx, url, 'spider:error', error);
      return metadataOrError;
    }

    const entryPath = getCorpusEntryDirForUrl(url);

    log.info(`Extracting Fields in ${entryPath}`);

    await extractFieldsForEntry(entryPath, log)

    // try again:
    fieldRecs = getCanonicalFieldRecs(alphaRec);
  }

  if (fieldRecs === undefined) {
    const msg = 'No extracted fields available';
    log.info(msg);
    await commitUrlStatus(dbCtx, url, 'extraction:warning', 'no canonical field record available');
    return ErrorRecord(msg);
  }
  if (fieldRecs.fields.length === 0) {
    await commitUrlStatus(dbCtx, url, 'extraction:warning', 'no fields extracted');
  } else {
    await commitUrlStatus(dbCtx, url, 'extraction:success', `extracted ${fieldRecs.fields.length} fields`);
  }

  return fieldRecs;
}


export async function fetchNextDBRecord(
  dbCtx: DatabaseContext,
  services: WorkflowServices,
): Promise<boolean | ErrorRecord> {

  const { log } = services;

  const url = await getNextUrlForSpidering(dbCtx);
  if (url === undefined) {
    log.info('No More Records to Process');
    return false;
  }

  log.info(`Fetching fields for ${url}`);

  // if we have the data on disk, just return it
  const entryPath = getCorpusEntryDirForUrl(url);

  // try:
  let fieldRecs = getCanonicalFieldRecord(entryPath);

  if (fieldRecs === undefined) {
    log.info(`No extracted fields found.. spidering ${url}`);
    const metadataOrError = await scrapeUrl(dbCtx, services, url);
    if ('error' in metadataOrError) {
      const { error } = metadataOrError;
      await commitUrlStatus(dbCtx, url, 'spider:error', error);
      return metadataOrError;
    }

    await commitMetadata(dbCtx, metadataOrError);

    log.info(`Extracting Fields in ${entryPath}`);
    await extractFieldsForEntry(entryPath, log)
  }

  // try again:
  fieldRecs = getCanonicalFieldRecord(entryPath);

  if (fieldRecs === undefined) {
    const msg = 'No extracted fields available';
    log.info(msg);
    return ErrorRecord(msg);
  }

  return true;
}

export async function fetchAllDBRecords(
  dbCtx: DatabaseContext,
  maxToFetch: number
): Promise<void> {
  const spiderService = await createSpiderService();

  const log = getServiceLogger('workflow');

  const workflowServices: WorkflowServices = {
    spiderService,
    log,
    dbCtx
  };

  let fetchCount = 0;
  let fetchNext = true;
  while (fetchNext) {
    const fetchResult = await fetchNextDBRecord(dbCtx, workflowServices);
    if (_.isBoolean(fetchResult)) {
      fetchNext = fetchResult;
    } else {

    }
    fetchCount += 1;
    if (maxToFetch > 0 && fetchCount >= maxToFetch) {
      fetchNext = false;
    }
  }

  log.info('Shutting down Spider')
  await spiderService.quit();

  log.info('Done')
}

async function scrapeUrl(
  dbCtx: DatabaseContext,
  services: WorkflowServices,
  url: string,
): Promise<Metadata | ErrorRecord> {
  const { spiderService, log } = services;
  const metadata = await spiderService
    .scrape(url)
    .catch((error: Error) => {
      return `${error.name}: ${error.message}`;
    });

  if (_.isString(metadata)) {
    const msg = `Spidering error ${metadata}`;
    log.info(msg);
    await commitUrlStatus(dbCtx, url, 'spider:error', msg);

    return ErrorRecord(msg);
  }
  if (metadata === undefined) {
    const msg = `Spider could not fetch url ${url}`;
    await commitUrlStatus(dbCtx, url, 'spider:error', msg);
    log.info(msg);
    return ErrorRecord(msg);
  }

  await commitMetadata(dbCtx, metadata);

  const spiderSuccess = metadata.status === '200';

  if (!spiderSuccess) {
    const msg = `Spider returned ${metadata.status} for ${metadata.requestUrl}`;
    log.info(msg);
    return ErrorRecord(msg);
  }
  return metadata;
}
