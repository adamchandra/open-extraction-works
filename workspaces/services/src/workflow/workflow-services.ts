import _ from 'lodash';

import path from 'path';
import { SpiderService } from '~/spidering/spider-service';
import { AlphaRecord } from 'commons';
import { CanonicalFieldRecords, extractFieldsForEntry, getCanonicalFieldRecord } from '~/extract/run-main';
import { makeHashEncodedPath } from '~/utils/hash-encoded-paths';
import * as winston from 'winston';

export interface WorkflowServices {
  log: winston.Logger;
  workingDir: string;
  spiderService: SpiderService;
}



interface ErrorRecord {
  error: string;
}

const ErrorRecord = (error: string): ErrorRecord =>
  ({ error });

export async function fetchOneRecord(
  services: WorkflowServices,
  alphaRec: AlphaRecord
): Promise<CanonicalFieldRecords | ErrorRecord> {

  const { spiderService, log, workingDir } = services;

  const { url } = alphaRec;

  log.info(`Fetching fields for ${url}`);

  // if we have the data on disk, just return it
  const downloadDir = path.resolve(workingDir, 'downloads.d');
  const entryEncPath = makeHashEncodedPath(url, 3);
  const entryPath = path.resolve(downloadDir, entryEncPath.toPath());

  // try:
  let fieldRecs = getCanonicalFieldRecord(entryPath);

  if (fieldRecs === undefined) {
    log.info(`No extracted fields found.. spidering ${url}`);
    const metadata = await spiderService
      .scrape(url)
      .catch((error: Error) => {
        // putStrLn('Error', error.name, error.message);
        return `${error.name}: ${error.message}`;
      });

    if (_.isString(metadata)) {
      const msg = `Spidering error ${metadata}`;
      log.info(msg);
      return ErrorRecord(msg);
    }
    if (metadata === undefined) {
      const msg = `Spider could not fetch url ${url}`;
      log.info(msg);
      return ErrorRecord(msg);
    }
    const spiderSuccess = metadata.status === '200';
    if (!spiderSuccess) {
      const msg = `Spider returned ${metadata.status} for ${metadata.requestUrl}`;
      log.info(msg);
      return ErrorRecord(msg);
    }

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

  fieldRecs.noteId = alphaRec.noteId;
  fieldRecs.title = alphaRec.title;
  fieldRecs.url = alphaRec.url;
  return fieldRecs;
}
