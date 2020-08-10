import _ from 'lodash';
import { Context } from 'koa';
import Router from 'koa-router';
import koaBody from 'koa-body';

import {
  csvStream,
  streamPump,
  AlphaRecord,
} from "commons";

import { createAppLogger } from './portal-logger';
import { insertAlphaRecords } from '~/db/db-api';
import { ServiceComm } from '~/service-graphs/service-comm';

// const log = createAppLogger();

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
  const requestBody = ctx.request.body;
  const responseBody: Record<string, string> = {};
  ctx.response.body = responseBody;

  if (requestBody) {
    // TODO validate requestBody as AlphaRecord[]
    const alphaRecs: AlphaRecord[] = requestBody;
    const newRecs = await insertAlphaRecords(alphaRecs);
    // TODO return all field records for which we have already have extraction results
    // TODO return status/error records for alpha requests for which there are no extraction results

    responseBody.insertionCount = newRecs.length.toString();
    responseBody.status = 'ok';
  } else {
    responseBody.status = 'error';
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
    .post(new RegExp(`${pathPrefix}/fields.json$`), koaBody(), curriedPostBatchCsv)
    ;

  return apiRouter;
}
