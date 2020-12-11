import _ from 'lodash';

import { CanonicalFieldRecords, extractFieldsForEntry, getCanonicalFieldRecord } from '~/extract/run-main';
import * as winston from 'winston';
import { AlphaRecord, getCorpusEntryDirForUrl } from 'commons';
import { createSpiderService, SpiderService } from './spider-service';
import { commitMetadata, commitUrlStatus, getNextUrlForSpidering, getUrlStatus, insertAlphaRecords, insertNewUrlChains } from '~/db/db-api';
import { getServiceLogger } from '~/utils/basic-logging';
import { Metadata } from 'spider';

export interface WorkflowServices {
  log: winston.Logger;
  spiderService: SpiderService;
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
  services: WorkflowServices,
  alphaRec: AlphaRecord,
): Promise<CanonicalFieldRecords | ErrorRecord> {

  const { log } = services;
  const { url } = alphaRec;

  log.info(`Fetching fields for ${url}`);

  // First attempt: if we have the data on disk, just return it
  let fieldRecs = getCanonicalFieldRecs(alphaRec);
  if (fieldRecs !== undefined) {
    return fieldRecs;
  }

  let urlStatus = await getUrlStatus(url);
  const currentUrlStatus = urlStatus === undefined ? `New url: ${url}` :
    `${urlStatus.status_code}: ${urlStatus.status_message}`;

  if (urlStatus !== undefined && urlStatus.status_code.includes('error')) {
    return ErrorRecord(currentUrlStatus);
  }

  log.info(currentUrlStatus);

  if (urlStatus === undefined) {
    log.info('Inserting record into database');
    await insertAlphaRecords([alphaRec]);
    await insertNewUrlChains();
    urlStatus = await getUrlStatus(url);
    const currentUrlStatus = urlStatus === undefined ? `New url: ${url}` :
      `${urlStatus.status_code}: ${urlStatus.status_message}`;

    log.info(currentUrlStatus);
  }

  // Try to spider/extract
  log.info(`No extracted fields found.. spidering ${url}`);
  const metadataOrError = await scrapeUrl(services, url);
  if ('error' in metadataOrError) {
    const { error } = metadataOrError;
    await commitUrlStatus(url, 'spider:error', error);
    return metadataOrError;
  }

  const entryPath = getCorpusEntryDirForUrl(url);

  log.info(`Extracting Fields in ${entryPath}`);

  await extractFieldsForEntry(entryPath, log)

  // try again:
  fieldRecs = getCanonicalFieldRecs(alphaRec);

  if (fieldRecs === undefined) {
    const msg = 'No extracted fields available';
    log.info(msg);
    return ErrorRecord(msg);
  }

  return fieldRecs;
}


export async function fetchNextDBRecord(
  services: WorkflowServices,
): Promise<boolean | ErrorRecord> {

  const { log } = services;

  const url = await getNextUrlForSpidering();
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
    const metadataOrError = await scrapeUrl(services, url);
    if ('error' in metadataOrError) {
      const { error } = metadataOrError;
      await commitUrlStatus(url, 'spider:error', error);
      return metadataOrError;
    }

    await commitMetadata(metadataOrError);

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

export async function fetchAllDBRecords(maxToFetch: number): Promise<void> {
  const spiderService = await createSpiderService();

  const log = getServiceLogger('workflow');

  const workflowServices: WorkflowServices = {
    spiderService,
    log
  };

  let fetchCount = 0;
  let fetchNext = true;
  while (fetchNext) {
    const fetchResult = await fetchNextDBRecord(workflowServices);
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
    await commitUrlStatus(url, 'spider:error', msg);

    return ErrorRecord(msg);
  }
  if (metadata === undefined) {
    const msg = `Spider could not fetch url ${url}`;
    await commitUrlStatus(url, 'spider:error', msg);
    log.info(msg);
    return ErrorRecord(msg);
  }

  await commitMetadata(metadata);

  const spiderSuccess = metadata.status === '200';

  if (!spiderSuccess) {
    const msg = `Spider returned ${metadata.status} for ${metadata.requestUrl}`;
    log.info(msg);
    return ErrorRecord(msg);
  }
  return metadata;
}
