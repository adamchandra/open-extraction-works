import _ from "lodash";

import {
  streamPump, expandDir, walkScrapyCacheCorpus, ensureArtifactDirectories
} from "commons";

import { initLogger } from '../logging/logging';
import { extractAbstractTransform, ExtractionAppContext, skipIfAbstractLogExisits } from './extract-abstracts';
// import { interactiveUIAppMain } from '~/qa-editing/interactive-ui';


export async function runMainExtractAbstracts(
  cacheRoot: string,
  logpath: string,
): Promise<void> {

  const dirEntryStream = walkScrapyCacheCorpus(cacheRoot);
  const log = initLogger(logpath, "abstract-finder", true);

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


// TODO move this to qa-review module
// export async function runMainInteractiveFieldReview(
//   corpusRoot: string
// ): Promise<void> {

//   const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);
//   const pumpBuilder = streamPump.createPump()
//     .viaStream<string>(dirEntryStream)
//     .throughF(expandDir)
//     .tap((entryPath) => {
//       return interactiveUIAppMain(entryPath);
//     });

//   return pumpBuilder.toPromise()
//     .then(() => undefined);


// }
