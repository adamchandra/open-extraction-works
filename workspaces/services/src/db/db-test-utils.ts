import jsonServer from 'json-server';
import { Database, openDatabase } from './database';
import { Application } from 'express';


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

export async function useEmptyDatabase(f: (db: Database) => Promise<void>): Promise<void> {
  const db = await createEmptyDB();
  return f(db).then(() => db.close());
}
