import Koa, { Context } from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import { initPortalRouter } from './portal-routes';
import { Server } from 'http';
import { createAppLogger } from './portal-logger';
import { ServiceComm } from '~/service-graphs/service-comm';

export async function startRestPortal(serviceComm: ServiceComm): Promise<Server> {
  const log = createAppLogger();
  const app = new Koa();
  const rootRouter = new Router();
  const portalRouter = initPortalRouter(serviceComm);

  const port = 3100;

  rootRouter
    .use('/', ((ctx: Context, next) => {
      ctx.set('Access-Control-Allow-Origin', '*');
      return next();
    }))
    // .use(koaBody({ multipart: true }))
    .use(portalRouter.routes())
    .use(portalRouter.allowedMethods())
    ;

  app
    .use(rootRouter.routes())
    .use(rootRouter.allowedMethods())
    .use(json({ pretty: false }))
    ;

  return new Promise((resolve) => {
    const server = app.listen(port, function() {
      log.info(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });
}
