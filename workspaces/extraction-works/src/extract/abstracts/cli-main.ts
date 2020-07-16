import _ from "lodash";

import path from "path";

import {
  streamPump, expandDir,
} from "commons";

import { readOrderCsv } from '~/openreview/workflow';
import { initLogger, readMetaFile } from '../logging/logging';
import { extractAbstractTransform, ExtractionAppContext, skipIfAbstractLogExisits } from './extract-abstracts';
import { AlphaRecord } from '../core/extraction-records';
import { walkScrapyCacheCorpus, ensureArtifactDirectories, writeCorpusJsonFile } from '~/corpora/corpus-file-walkers';
import { readUrlFetchChainsFromScrapyLogs } from '../urls/url-fetch-chains';
import { diff } from 'deep-diff';
import { runInteractiveReviewUI } from '~/qa-review/interactive-ui';
import { interactiveUIAppMain } from '~/qa-editing/interactive-ui';

async function createAlphaRecordDict(csvFile: string): Promise<Map<string, AlphaRecord>> {
  const inputStream = readOrderCsv(csvFile);

  const urlDict = new Map<string, AlphaRecord>();

  const pumpBuilder = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .throughF((inputRec: AlphaRecord) => {
      const { url } = inputRec;
      urlDict.set(url, inputRec);
    })
    .onEnd(async () => {
      console.log({ event: "done createAlphaRecordDict" });
    });

  return pumpBuilder
    .toPromise()
    .then(() => urlDict);
}

export async function runMainWriteAlphaRecords(
  corpusRoot: string,
  scrapyLog: string,
  csvFile: string,
): Promise<void> {

  // TODO: scrapy logging -> url db should be part of the spidering process
  const urlGraph = await readUrlFetchChainsFromScrapyLogs(scrapyLog);
  const csvLookup = await createAlphaRecordDict(csvFile);

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);
  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .tap((entryPath: string) => {
      const metaFilePath = path.resolve(entryPath, 'meta');
      const metaProps = readMetaFile(metaFilePath);
      if (!metaProps) return;

      const { url } = metaProps;

      const urlFetchChain = urlGraph.getUrlFetchChain(url);
      const fetchedUrls = _.sortBy(_.uniq(_.map(urlFetchChain, chain => chain.requestUrl)));

      const alphaRecsForFetched = fetchedUrls
        .map(u => csvLookup.get(u))
        .filter(u => !_.isNil(u));

      const uniqAlphaRecs = _.uniqWith(alphaRecsForFetched, (reca, recb) => {
        const recDiffs = diff(reca, recb);
        return !recDiffs;
      });

      writeCorpusJsonFile(entryPath, 'spidering-logs', 'url-fetch-chain.json', urlFetchChain);
      writeCorpusJsonFile(entryPath, 'spidering-logs', 'alpha-records.json', uniqAlphaRecs);
    });

  return pumpBuilder.toPromise()
    .then(() => undefined);
}

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


export async function runMainInteractiveFieldReview(
  corpusRoot: string
): Promise<void> {

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);
  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .throughF(expandDir)
    .tap((entryPath) => {
      return interactiveUIAppMain(entryPath);
    });

  return pumpBuilder.toPromise()
    .then(() => undefined);


}
