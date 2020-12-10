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

describe('End-to-end Extraction workflows', () => {

  const csvFile = './test/resources/dblp_urls-10.csv';
  const inputStream = readAlphaRecStream(csvFile);

  const alphaRecsP = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .gather()
    .toPromise()


  const workingDir = './workflow-test.d';
  const corpusRoot = path.join(workingDir, 'corpus-root.d');
  setEnv(Env.AppSharePath, workingDir);

  beforeEach(() => {
    fs.emptyDirSync(workingDir);
    fs.removeSync(workingDir);
    fs.mkdirSync(workingDir);
  });

  it.only('tests disabled as they scrape live URLs', () => undefined);

  it('should fetch all records in CSV', async (done) => {
    const alphaRecs = await alphaRecsP;
    if (alphaRecs === undefined || alphaRecs.length === 0) {
      return done('could not read alpha rec csv')
    }

    const spiderService = await createSpiderService();

    const log = getServiceLogger('jest');

    const workflowServices: WorkflowServices = {
      spiderService,
      log
    };
    const alphaRec = alphaRecs[1];

    const fetchedRecord = await fetchOneRecord(workflowServices, alphaRec);

    prettyPrint({ fetchedRecord });

    await spiderService.quit();

    await runMainBundleExtractedFields(corpusRoot, csvFile);
    done();
  });

  it('should fetch a single record', async (done) => {

    const spiderService = await createSpiderService();

    const log = getServiceLogger('jest');

    const workflowServices: WorkflowServices = {
      spiderService,
      log
    };
    // const alphaRec = alphaRecs[1];
    const alphaRec: AlphaRecord = {
      url: 'https://doi.org/10.1109/ICMLA.2009.66',
      noteId: '',
      dblpConfId: '',
      title: '',
    };

    const fetchedRecord = await fetchOneRecord(workflowServices, alphaRec);

    prettyPrint({ fetchedRecord });

    await spiderService.quit();

    done();
  });

});
