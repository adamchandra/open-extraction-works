import { Context } from 'koa';
import Router from 'koa-router';
import redis from "redis";
import { promisify } from 'util';

import {
  csvStream,
  streamPump,
} from "commons";
import { createAppLogger } from './portal-logger';
import { getRedisClient, getAsyncRedisClient } from './redis-client';

export function readOrderCsv(csvfile: string): Promise<void> {
  const inputStream = csvStream(csvfile);
  const log = createAppLogger();

  const pumpBuilder = streamPump.createPump()
    .viaStream<string[]>(inputStream)
    .throughF((csvRec: string[]) => {
      const [noteId, dblpConfId, title, url, authorId] = csvRec;
      const rec = {
        noteId, dblpConfId, url, title, authorId
      };
      log.log({
        level: 'info',
        message: 'rest-portal-input',
        id: `${noteId}+${url}`,
        ...rec
      });
      return rec
    })
  ;


  // TODO save the records to local file
  // generate log entries suitable for filebeat consumption
  const p = pumpBuilder
    .toPromise()
    .then(() => undefined)
  ;

  return p;
}

async function publishDownstream() {

  const redisClient = await getAsyncRedisClient();
  await redisClient.set("key", "value")
    .then(() => undefined);



  await redisClient.get("key")
    .then((z) => console.log(z))
    .catch(console.error)
  ;

  await redisClient.quit();


}
async function postBatchCsv(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const { files } = ctx.request;

  // Stash incoming file to /data-root/portal/ingress/zzz-incoming.csv/json
  // Respond with status/endpoints for completed work
  // Publish to downstream pipeline

  if (files) {
    const { data } = files;
    await readOrderCsv(data.path)
    ctx.response.body = { status: 'ok' };
  } else {
    ctx.response.body = { status: 'error' };
  }

  return next();
}

async function getBatchCsv(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getBatchCsv');

  return next();
}

async function getRoot(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getRoot');

  return next();
}

export function initPortalRouter(): Router {
  const apiRouter = new Router({});
  const pathPrefix = '/extractor'

  apiRouter
    .get(new RegExp(`${pathPrefix}/`), getRoot)
    .post(new RegExp(`${pathPrefix}/batch.csv`), postBatchCsv)
    .get(new RegExp(`${pathPrefix}/batch.csv`), getBatchCsv)
  ;

  return apiRouter;
}
