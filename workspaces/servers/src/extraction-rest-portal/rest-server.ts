import Koa, { Context } from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import koaBody from 'koa-body';
import { initPortalRouter } from './portal-routes';
import { arglib } from "commons";
const { opt, config, registerCmd, YArgs } = arglib;

registerCmd(
  YArgs,
  "portal-server",
  "remove records from csv that have already been spidered",
  config(
    opt.cwd,
  )
)(() => {
  // const { scrapyLog, csv } = opts;

  const app = new Koa();
  const rootRouter = new Router();
  const portalRouter = initPortalRouter();

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

  app.listen(port, function() {
    console.log(`Koa is listening to http://localhost:${port}`);
  });

});
