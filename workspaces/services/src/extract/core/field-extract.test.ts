import 'chai/register-should';

import _ from 'lodash';

import { prettyPrint } from 'commons';
import { getBasicConsoleLogger } from '~/utils/basic-logging';
import { ExtractionAppContext, runAbstractFinders } from '../abstracts/extract-abstracts';
import fs from 'fs-extra';
import cproc from 'child_process';
import path from 'path';
import { AbstractPipeline } from '../abstracts/rules-pipeline';
import Async from 'async';
import { exampleExtractionAttempt } from './field-extract-utils';

describe('Field Extraction Pipeline', () => {

  const testCorpus = './test/resources/spidered-corpus';
  const testScratchDir = './test-scratch.d';

  beforeEach(() => {
    fs.emptyDirSync(testScratchDir);
    fs.rmdirSync(testScratchDir);
    fs.mkdirpSync(testScratchDir);
    // TODO don't use linux shell commands here:
    cproc.execSync(`cp -rl ${testCorpus} ${testScratchDir}/`)
  });


  it('should run the abstract finder', async (done) => {
    const examples = [
      '22dae',
      '22133',
      '22168'
    ];

    const log = getBasicConsoleLogger('silly');
    const ctx: ExtractionAppContext = {
      log,
    };

    await Async.mapSeries(examples, async example => {
      const entryPath = path.join(testScratchDir, 'spidered-corpus', example);
      const extractedFields = await runAbstractFinders(ctx, AbstractPipeline, entryPath);
      prettyPrint({ extractedFields });

    });

    done();
  });

  it.only('trying env function composition ', () => {
    //
    exampleExtractionAttempt();

  });
});
