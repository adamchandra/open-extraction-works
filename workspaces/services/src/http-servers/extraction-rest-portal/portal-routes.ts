import _ from 'lodash';
import { Context } from 'koa';
import Router from 'koa-router';
import koaBody from 'koa-body';

import {
  AlphaRecord,
} from 'commons';

import { fetchOneRecord, WorkflowServices } from '~/workflow/workflow-services';

async function postRecordJson(
  workflowServices: WorkflowServices,
  ctx: Context,
  next: () => Promise<any>
): Promise<Router> {
  const requestBody = ctx.request.body;
  const responseBody: Record<string, string> = {};
  ctx.response.body = responseBody;

  if (requestBody) {
    // TODO validate requestBody as AlphaRecord[]
    const alphaRec: AlphaRecord = requestBody;

    const responseRec = await fetchOneRecord(workflowServices, alphaRec);
    _.merge(responseBody, responseRec)
    responseBody.status = 'ok';
  } else {
    responseBody.status = 'error';
  }

  return next();
}

async function getRoot(ctx: Context, next: () => Promise<any>): Promise<Router> {
  const p = ctx.path;
  console.log('getRoot', p);
  return next();
}


export function initPortalRouter(workflowServices: WorkflowServices): Router {
  const apiRouter = new Router({});
  const pathPrefix = '^/extractor'

  const postRecordJson_ = _.curry(postRecordJson)(workflowServices);

  apiRouter
    .get(new RegExp(`${pathPrefix}/$`), getRoot)
    .post(new RegExp(`${pathPrefix}/record.json$`), koaBody(), postRecordJson_)
  ;

  return apiRouter;
}
