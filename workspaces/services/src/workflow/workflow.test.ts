import 'chai/register-should';

import _ from 'lodash';
import { prettyPrint, AlphaRecord, readAlphaRecStream, streamPump } from 'commons';
import { fetchOneRecord, WorkflowServices } from './workflow-services';
import fs from 'fs-extra';


import { createSpiderService } from '~/spidering/spider-service';
import { getServiceLogger } from '~/utils/basic-logging';
// import { getServiceLogger } from '~/service-graphs/service-logger';

describe('End-to-end Extraction workflows', () => {

  const csvFile = './test/resources/dblp_urls-10.csv';
  const inputStream = readAlphaRecStream(csvFile);

  const alphaRecsP = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .gather()
    .toPromise()


  const workingDir = './workflow-test.d';

  beforeEach(() => {
    fs.emptyDirSync(workingDir);
    // fs.mkdirSync(workingDir);
  });

  it('should fetch a single record', async (done) => {
    const alphaRecs = await alphaRecsP;

    const spiderService = await createSpiderService(workingDir);

    const log = getServiceLogger('jest');

    const workflowServices: WorkflowServices = {
      workingDir,
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
