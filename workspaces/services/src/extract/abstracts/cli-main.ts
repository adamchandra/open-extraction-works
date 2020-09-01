import _ from "lodash";

import {
  streamPump, walkScrapyCacheCorpus, ensureArtifactDirectories
} from "commons";

import { extractAbstractTransform, ExtractionAppContext, skipIfAbstractLogExisits } from './extract-abstracts';
import { getBasicLogger } from '~/utils/basic-logging';
// import { interactiveUIAppMain } from '~/qa-editing/interactive-ui';


export async function runMainExtractAbstracts(
  cacheRoot: string,
  logpath: string,
): Promise<void> {

  const dirEntryStream = walkScrapyCacheCorpus(cacheRoot);
  const log = getBasicLogger(logpath, 'abstract-finder-log.json');

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .initEnv<ExtractionAppContext>(() => ({
      log,
    }))
    .tap(ensureArtifactDirectories)
    .filter(skipIfAbstractLogExisits)
    .tap(extractAbstractTransform);

  return pumpBuilder.toPromise()
    .then(() => undefined);

}
