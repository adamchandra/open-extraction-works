import _ from 'lodash';
import { Context } from 'koa';
import Router from 'koa-router';
import koaBody from 'koa-body';

import {
  csvStream,
  streamPump,
  AlphaRecord,
} from 'commons';

import { createAppLogger } from './portal-logger';
import { SatelliteServiceComm } from '~/service-graphs/service-hub';

// REST response types
export interface FieldsResponse {
  kind: 'fields';
}
export interface ErrorResponse {
  kind: 'error';
}
export interface PendingResponse {
  kind: 'pending';
}

export type RestResponse =
  FieldsResponse;

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


import { Server } from 'http';
import { Yield } from '~/service-graphs/service-defs';

async function postRecordJson(
  serviceComm: SatelliteServiceComm<Server>,
  ctx: Context,
  next: () => Promise<any>
): Promise<Router> {
  const requestBody = ctx.request.body;
  const responseBody: Record<string, string> = {};
  ctx.response.body = responseBody;

  if (requestBody) {
    // TODO validate requestBody as AlphaRecord[]
    const alphaRec: AlphaRecord = requestBody;
    // const extractedFields: string = await serviceComm.yield(alphaRec);
    serviceComm.push(Yield.create(alphaRec));

    responseBody.status = 'ok';
    // responseBody.fields = extractedFields;
  } else {
    responseBody.status = 'error';
  }

  // await serviceComm.emit('step');
  return next();
}

// async function getBatchCsv(ctx: Context, next: () => Promise<any>): Promise<Router> {
//   const p = ctx.path;
//   console.log('getBatchCsv', p);
//   ctx.response.body = { status: 'ok' };

//   return next();
// }

async function getRoot(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getRoot', p);
  return next();
}


export function initPortalRouter(serviceComm: SatelliteServiceComm<Server>): Router {
  const apiRouter = new Router({});
  const pathPrefix = '^/extractor'

  // const curriedPostBatchCsv = _.curry(postBatchCsv)(serviceComm);
  const postRecordJson_ = _.curry(postRecordJson)(serviceComm);

  apiRouter
    .get(new RegExp(`${pathPrefix}/$`), getRoot)
    .post(new RegExp(`${pathPrefix}/record.json$`), koaBody(), postRecordJson_)
  ;

  // .get(new RegExp(`${pathPrefix}/batch.csv$`), getBatchCsv)
    // .post(new RegExp(`${pathPrefix}/fields.json$`), koaBody(), curriedPostBatchCsv)

  return apiRouter;
}
