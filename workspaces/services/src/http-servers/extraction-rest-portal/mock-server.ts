import _ from 'lodash';
import Koa, { Context } from 'koa';
import Router from 'koa-router';
import { Server } from 'http';
import { createAppLogger } from './portal-logger';
import { stripMargin } from 'commons';

const mockHtml = stripMargin(`
|<html>
|  <head>
|    <meta name="citation_author" content="Holte, Robert C." />
|    <meta name="citation_author" content="Burch, Neil" />
|    <meta name="citation_title" content="Automatic move pruning for single-agent search" />
|    <meta name="dc.Creator" content="Adam" />
|    <meta name="dc.creator" content="adam" />
|    <meta property="og:description" content="success: We consider a new learning model in which a joint distributi" />
|  </head>
|
|  <body>
|    <section class="Abstract" id="Abs1" tabindex="-1" lang="en" xml:lang="en">
|      <h2 class="Heading">
|        Abstract
|      </h2>
|      <p class="Para">
|        success: We present
|      </p>
|    </section>
|    <a class="show-pdf" href="/success:pdf">PDF</a>
|
|    <div class="Abstracts u-font-serif" id="abstracts">
|        <div class="abstract author" id="aep-abstract-id6">
|            <h2 class="section-title u-h3 u-margin-l-top u-margin-xs-bottom">
|                Abstract
|            </h2>
|            <div id="aep-abstract-sec-id7">
|                <p>
|                    success1
|                </p>
|                <p>
|                    success2
|                </p>
|            </div>
|        </div>
|    </div>
|
|  </body>
|</html>
`);


export async function startSpiderableTestServer(): Promise<Server> {
  const log = createAppLogger();
  const app = new Koa();
  const rootRouter = new Router();

  const port = 9100;

  rootRouter
    .use('/', ((ctx: Context, next) => {
      ctx.set('Access-Control-Allow-Origin', '*');
      return next();
    }));


  rootRouter.get(':status/:content', (ctx: Context, next: () => Promise<any>) => {
    const { params, response } = ctx;
    const { status, content } = params;

    response.type = 'html';
    response.status = status;
    response.body = mockHtml;
    return next();
  });

  app
    .use(rootRouter.routes())
    .use(rootRouter.allowedMethods())
    ;

  return new Promise((resolve) => {
    const server = app.listen(port, function() {
      log.info(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });
}
