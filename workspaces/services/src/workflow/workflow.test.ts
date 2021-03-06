import 'chai/register-should';

import _ from 'lodash';
import { getCorpusEntryDirForUrl, prettyPrint, putStrLn } from 'commons';
import { fetchOneRecord, WorkflowServices } from './workflow-services';
import fs from 'fs-extra';
import Async from 'async';

// import { createSpiderService } from '~/spidering/spider-service';
import { getServiceLogger } from '~/utils/basic-logging';
import { AlphaRecord } from 'commons';
import { setEnv } from 'commons';
import { createSpiderService } from './spider-service';
import { startSpiderableTestServer } from '~/http-servers/extraction-rest-portal/mock-server';
import got from 'got';
import { getDBConfig } from '~/db/database';
import { DatabaseContext } from '~/db/db-api';
import { createEmptyDB } from '~/db/db-test-utils';
import { Server } from 'http';
import { extractFieldsForEntry } from '~/extract/run-main';

describe('End-to-end Extraction workflows', () => {

  function mockAlphaRecord(n: number, urlPath: string): AlphaRecord {
    return ({
      noteId: `note-id-${n}`,
      dblpConfId: `dblp/conf/conf-${n}`, // TODO rename to dblpKey
      title: `The Title Paper #${n}`,
      authorId: `auth-${n}`,
      url: `http://localhost:9100${urlPath}`
    });
  }

  const workingDir = './workflow-test.d';
  setEnv('AppSharePath', workingDir);
  setEnv('DBPassword', 'watrpasswd');
  const dbConfig = getDBConfig('test');
  const dbCtx: DatabaseContext | undefined = dbConfig ? { dbConfig } : undefined;
  expect(dbCtx).toBeDefined;
  if (dbConfig === undefined || dbCtx === undefined) return;

  let server: Server | undefined = undefined;

  beforeEach(() => {
    fs.emptyDirSync(workingDir);
    fs.removeSync(workingDir);
    fs.mkdirSync(workingDir);
    return startSpiderableTestServer()
      .then(s => {
        server = s
      })
      .then(() => createEmptyDB(dbConfig))
      .then((db) => db.close());
  });


  afterEach(() => {
    return new Promise<void>((resolve) => {
      if (server !== undefined) {
        server.close(() => resolve());
      }
    })
  });


  it('should fetch alpha records', async () => {
    const log = getServiceLogger('test-run');

    const spiderService = await createSpiderService();

    const workflowServices: WorkflowServices = {
      spiderService,
      log,
      dbCtx
    };
    const exampleUrls = [
      '/200~withFields',
      '/200~withoutFields',
      '/404~custom404',
    ];

    await Async.eachOfSeries(exampleUrls, async (url, exampleNumber) => {
      const alphaRec = mockAlphaRecord(1, url);
      const fetchedRecord = await fetchOneRecord(dbCtx, workflowServices, alphaRec);
      prettyPrint({ exampleNumber, fetchedRecord });
    });

    await spiderService.quit();
  });

  it('should update database if fields are extracted but no db entry exists', async () => {

    const log = getServiceLogger('test-run');

    const spiderService = await createSpiderService();

    const workflowServices: WorkflowServices = {
      spiderService,
      log,
      dbCtx
    };
    const exampleUrls = [
      '/200~withFields',
    ];

    await Async.eachOfSeries(exampleUrls, async (_url, exampleNumber) => {
      const alphaRec = mockAlphaRecord(1, _url);
      const { url } = alphaRec;
      await spiderService
        .scrape(url)
        .catch((error: Error) => {
          return `${error.name}: ${error.message}`;
        });

      const entryPath = getCorpusEntryDirForUrl(url);
      await extractFieldsForEntry(entryPath, log)

      const fetchedRecord = await fetchOneRecord(dbCtx, workflowServices, alphaRec);
      prettyPrint({ exampleNumber, fetchedRecord });
    });

    await spiderService.quit();
  });

});
