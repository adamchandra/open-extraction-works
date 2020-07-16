//
import path from "path";
import fs from "fs-extra";
import jsonServer from 'json-server';
import { Database, openDatabase } from './database';
import { Application } from 'express';

export function initTestCorpusDirs(scratchDir: string): { corpusRoot: string, corpusPath: string } {
  if (fs.existsSync(scratchDir)) {
    fs.removeSync(scratchDir);
  }
  const corpusRoot = 'corpus-root.d';
  const corpusPath = path.join(scratchDir, corpusRoot)

  fs.mkdirpSync(corpusPath);
  const spiderInputCSV = path.join(scratchDir, 'input-recs.csv');
  fs.writeFileSync(spiderInputCSV, `
Y15,dblp.org/journals/LOGCOM/2012,Title: Adv. in Cognitive Science.,http://localhost:9000/htmls/page0.html
Y35,dblp.org/journals/LOGCOM/2014,Title: Some Third Title,http://localhost:9000/htmls/page1.html
Y25,dblp.org/journals/LOGCOM/2013,Title: Some Other Title,http://localhost:9000/htmls/page2.html
`);

  return {
    corpusRoot,
    corpusPath,
  };
}

type CloseableCB = { close(cb: () => void): void };
type CloseableApplication = Application & CloseableCB;

export async function startTestHTTPServer(staticFilesRoot: string): Promise<CloseableApplication> {
  // start fake server
  const server = jsonServer.create();
  const middlewares = jsonServer.defaults({
    static:staticFilesRoot
  });

  server.use(middlewares)

  // const router = jsonServer.router('db.json')
  // server.use(router)

  const app: any = await new Promise((resolve) => {
    const app = server.listen(9000, () => {
      console.log('JSON Server is running')
      resolve(app);
    });
  });
  return app;
}


export async function createEmptyDB(): Promise<Database> {
  const db = await openDatabase();
  const freshDB = await db.unsafeResetDatabase();
  return freshDB;
}
