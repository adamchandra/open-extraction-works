import 'chai/register-should';

import _ from 'lodash';
import { prettyPrint, streamPump } from 'commons';
import { fetchOneRecord, WorkflowServices } from './workflow-services';
import fs from 'fs-extra';
import path from 'path';


// import { createSpiderService } from '~/spidering/spider-service';
import { getServiceLogger } from '~/utils/basic-logging';
import { AlphaRecord, readAlphaRecStream } from 'commons';
import { Env, setEnv } from 'commons';
import { createSpiderService } from './spider-service';
import { runMainBundleExtractedFields } from '~/extract/run-main';
import { startSpiderableTestServer } from '~/http-servers/extraction-rest-portal/mock-server';
import got from 'got';
import { getDBConfig } from '~/db/database';
import { DatabaseContext } from '~/db/db-api';

describe('End-to-end Extraction workflows', () => {

  const workingDir = './workflow-test.d';
  setEnv('AppSharePath', workingDir);
  setEnv('DBPassword', 'watrpasswd');
  const dbConfig = getDBConfig('test');
  const dbCtx: DatabaseContext | undefined = dbConfig? { dbConfig } : undefined;
  expect(dbCtx).toBeDefined;
  if (dbConfig === undefined || dbCtx === undefined) return;

  beforeEach(() => {
    fs.emptyDirSync(workingDir);
    fs.removeSync(workingDir);
    fs.mkdirSync(workingDir);
  });


  it('should test fake spiderable internet', async (done) => {
    const server = await startSpiderableTestServer();

    const sdf = await got('http://localhost:9000/');
    const { body, headers } = sdf;

    prettyPrint({ body, headers });

    server.close(() => done());
  });

  function mockAlphaRecord(n: number, urlPath: string): AlphaRecord {
    return ({
      noteId: `note-id-${n}`,
      dblpConfId: `dblp/conf/conf-${n}`, // TODO rename to dblpKey
      title: `The Title Paper #${n}`,
      authorId: `auth-${n}`,
      url: `http://localhost:9100/${urlPath}`
    });
  }

  it.only('should fetch alpha records', async (done) => {
    const log = getServiceLogger('test-run');
    const server = await startSpiderableTestServer();

    const spiderService = await createSpiderService();
    if (dbCtx === undefined) {
      return done('db config error');
    }



    const workflowServices: WorkflowServices = {
      spiderService,
      log,
      dbCtx
    };

    const alphaRec = mockAlphaRecord(1, '200/');
    const fetchedRecord = await fetchOneRecord(dbCtx, workflowServices, alphaRec);

    prettyPrint({ fetchedRecord });

    await spiderService.quit();
    server.close(() => done());
  });

  // it('should fetch a single record', async (done) => {

  //   const spiderService = await createSpiderService();

  //   const log = getServiceLogger('jest');

  //   const workflowServices: WorkflowServices = {
  //     spiderService,
  //     log
  //   };
  //   // const alphaRec = alphaRecs[1];
  //   const alphaRec: AlphaRecord = {
  //     url: 'https://doi.org/10.1109/ICMLA.2009.66',
  //     noteId: '',
  //     dblpConfId: '',
  //     title: '',
  //   };

  //   const fetchedRecord = await fetchOneRecord(workflowServices, alphaRec);

  //   prettyPrint({ fetchedRecord });

  //   await spiderService.quit();

  //   done();
  // });

});
