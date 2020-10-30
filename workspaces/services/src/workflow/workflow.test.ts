import 'chai/register-should';

import _ from 'lodash';
import { prettyPrint,  streamPump } from 'commons';
import { fetchOneRecord, WorkflowServices } from './workflow-services';
import fs from 'fs-extra';


import { createSpiderService } from '~/spidering/spider-service';
import { getServiceLogger } from '~/utils/basic-logging';
import { AlphaRecord, readAlphaRecStream } from '~/prelude/types';
import { Env, setEnv } from '~/prelude/config';

describe('End-to-end Extraction workflows', () => {

  const csvFile = './test/resources/dblp_urls-10.csv';
  const inputStream = readAlphaRecStream(csvFile);

  const alphaRecsP = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .gather()
    .toPromise()


  const workingDir = './workflow-test.d';
  setEnv(Env.AppSharePath, workingDir);

  beforeEach(() => {
    fs.emptyDirSync(workingDir);
    fs.removeSync(workingDir);
    fs.mkdirSync(workingDir);
  });

  it('should fetch a single record', async (done) => {
    const alphaRecs = await alphaRecsP;

    const spiderService = await createSpiderService();

    const log = getServiceLogger('jest');

    const workflowServices: WorkflowServices = {
      spiderService,
      log
    };
    if (alphaRecs === undefined || alphaRecs.length === 0) {
      return done('could not read alpha rec csv')
    }
    const alphaRec = alphaRecs[1];
    const fetchedRecord = await fetchOneRecord(workflowServices, alphaRec);

    prettyPrint({ fetchedRecord });

    await spiderService.quit();

    done();
  });

});
