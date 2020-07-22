import _ from 'lodash';
import { Context } from 'koa';
import Router from 'koa-router';

import {
  csvStream,
  streamPump,
} from "commons";

import { createAppLogger } from './portal-logger';
import { ServiceComm } from '~/workflow/service-comm';

export function readAlphaRecStream(csvfile: string): Promise<void> {
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

async function postBatchCsv(serviceComm: ServiceComm, ctx: Context, next: () => Promise<any>): Promise<Router> {
  const { files } = ctx.request;

  // Stash incoming file to /data-root/portal/ingress/zzz-incoming.csv/json

  if (files) {
    const { data } = files;
    await readAlphaRecStream(data.path)
    await serviceComm.sendTo('hub', 'done');
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

export function initPortalRouter(serviceComm: ServiceComm): Router {
  const apiRouter = new Router({});
  const pathPrefix = '/extractor'

  const curriedPostBatchCsv = _.curry(postBatchCsv)(serviceComm);

  apiRouter
    .get(new RegExp(`${pathPrefix}/`), getRoot)
    .post(new RegExp(`${pathPrefix}/batch.csv`), curriedPostBatchCsv)
    .get(new RegExp(`${pathPrefix}/batch.csv`), getBatchCsv)
  ;

  return apiRouter;
}
