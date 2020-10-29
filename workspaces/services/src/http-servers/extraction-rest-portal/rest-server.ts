import Koa, { Context } from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import { initPortalRouter } from './portal-routes';
import { Server } from 'http';
import { createAppLogger } from './portal-logger';
import { WorkflowServices } from '~/workflow/workflow-services';
import { createSpiderService } from '~/spidering/spider-service';


function getWorkingDir(): string {
  const appSharePath = process.env['APP_SHARE_PATH'];
  const workingDir = appSharePath ? appSharePath : 'app-share.d';
  return workingDir;
}

export async function startRestPortal(): Promise<Server> {
  const log = createAppLogger();
  const app = new Koa();
  const rootRouter = new Router();


  const workingDir = getWorkingDir();
  const spiderService = await createSpiderService(workingDir);
  const workflowServices: WorkflowServices = {
    workingDir,
    spiderService,
    log
  };

  const portalRouter = initPortalRouter(workflowServices);

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
