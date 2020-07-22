import Koa, { Context } from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import koaBody from 'koa-body';
import { initPortalRouter } from './portal-routes';
import { Server } from 'http';
import { ServiceComm } from '~/workflow/service-comm';

export async function startRestPortal(serviceComm: ServiceComm): Promise<Server> {
  const app = new Koa();
  const rootRouter = new Router();
  const portalRouter = initPortalRouter(serviceComm);

  const port = 3100;

  rootRouter
    .use("/", ((ctx: Context, next) => {
      ctx.set('Access-Control-Allow-Origin', '*');
      return next();
    }))
    .use(koaBody({ multipart: true }))
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
      console.log(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });
}
