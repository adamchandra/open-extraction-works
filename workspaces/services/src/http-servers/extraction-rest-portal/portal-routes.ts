import _ from 'lodash';
import { Context } from 'koa';
import Router from 'koa-router';
import fs from "fs-extra";

import {
  csvStream,
  streamPump,
  prettyPrint,
  AlphaRecord,
} from "commons";

import { createAppLogger } from './portal-logger';
import { ServiceComm } from '~/workflow/service-comm';
import { openDatabase } from '~/db/database';
import { createAlphaRequest } from '~/db/db-api';

export function readAlphaRecStream(csvfile: string): Promise<AlphaRecord[]> {
  const inputStream = csvStream(csvfile);
  const log = createAppLogger();

  const pumpBuilder = streamPump.createPump()
    .viaStream<string[]>(inputStream)
    .throughF((csvRec: string[]) => {
      const [noteId, dblpConfId, title, url, authorId] = csvRec;
      const rec: AlphaRecord = {
        noteId, dblpConfId, url, title, authorId
      };
      log.info(`alpha rec: ${noteId} ${url}`);
      return rec
    });

  const p = pumpBuilder
    .gather()
    .toPromise()
    .then((recs) => recs || []);

  return p;
}

async function postBatchCsv(
  serviceComm: ServiceComm,
  ctx: Context,
  next: () => Promise<any>
): Promise<Router> {
  const { files } = ctx.request;
  prettyPrint({ mgs: 'postBatchCsv' })
  const db = await openDatabase();
  const body: Record<string, string> = {};
  ctx.response.body = body;

  if (files) {
    const { data } = files;
    const alphaRecs = await readAlphaRecStream(data.path)
    await db.runTransaction(async (_sql, transaction) => {
      const newRecs = await createAlphaRequest(transaction, alphaRecs);
    });

    fs.unlinkSync(data.path);
    body.status = 'ok';
  } else {
    ctx.response.body = { status: 'error' };
  }

  // TODO this emit can be moved to middleware outside of here
  await serviceComm.emit('step');
  return next();
}

async function getBatchCsv(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getBatchCsv', p);
  ctx.response.body = { status: 'ok' };

  return next();
}

async function getRoot(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getRoot', p);

  return next();
}

export function initPortalRouter(serviceComm: ServiceComm): Router {
  const apiRouter = new Router({});
  const pathPrefix = '^/extractor'

  const curriedPostBatchCsv = _.curry(postBatchCsv)(serviceComm);

  apiRouter
    .get(new RegExp(`${pathPrefix}/batch.csv$`), getBatchCsv)
    .get(new RegExp(`${pathPrefix}/$`), getRoot)
    .post(new RegExp(`${pathPrefix}/batch.csv$`), curriedPostBatchCsv)
    ;

  return apiRouter;
}
