import Koa, { Context } from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import { initPortalRouter } from './portal-routes';
import { Server } from 'http';
import { createAppLogger } from './portal-logger';
import { WorkflowServices } from '~/workflow/workflow-services';
import { createSpiderService } from '~/spidering/spider-service';
import { arglib } from 'commons';
const { opt, config, registerCmd } = arglib;


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

registerCmd(
  arglib.YArgs,
  'service-portal',
  'start rest server for spidering and extraction',
  config(
    opt.cwd,
    opt.existingDir('working-directory: root directory for logging/tmpfile/downloading'),
    opt.ion('dockerize', {
      type: 'boolean',
      default: false,
    })
  )
)((args: any) => {
  const { workingDirectory, url } = args;
  startRestPortal()
    .then(() => {
      //
    });
});
