import 'chai/register-should';
import path from 'path';
import _ from 'lodash';
import { putStrLn } from 'commons';
import { runFieldExtractors } from './extraction-process-v2';
import fs from 'fs-extra';
import cproc from 'child_process';
import Async from 'async';

import { getBasicConsoleLogger } from '~/utils/basic-logging';
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

  it.only('trying env function composition ', async (done) => {
    const examples = [
      '22dae',
      // '22133',
      // '22168'
    ];
    putStrLn('before attempts');
    const log = getBasicConsoleLogger();
    await Async.mapSeries(examples, async example => {
      const entryPath = path.join(testScratchDir, 'spidered-corpus', example);

      return runFieldExtractors(entryPath, { log });
    });

    putStrLn('after attempts');

    done();
  });
});
