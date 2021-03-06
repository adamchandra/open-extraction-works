import 'chai/register-should';

import _ from 'lodash';
import path from 'path';

import { prettyPrint, throughFunc,  } from 'commons';
import { runTidyCmd, runTidyCmdBuffered } from './run-cmd-tidy-html';
import { runFileCmd } from './run-cmd-file';

describe('run command-line utils ', () => {
  const testDirPath = './test/resources/htmls';
  const configFile = './conf/tidy.cfg';

  it('should run Html5 Tidy to re-write htmls', async (done) => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const { outStream, completePromise } =
      runTidyCmd(configFile, htmlFile);

    const lines: string[] = [];

    outStream
      .pipe(throughFunc(
        (line: string, _onerr?: (e: any) => void) => {
          lines.push(line);
        }))
      .on('data', () => undefined);

    await completePromise;

    const head = lines.slice(0, 10);
    prettyPrint({ msg: 'tidied file', head });

    done();

  });

  it('should get file types using file cmd', async (done) => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const fileType = await runFileCmd(htmlFile);
    prettyPrint({ fileType });
    done();
  });

  it('should handle process err output', async (done) => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const [err, out, exitCode] = await runTidyCmdBuffered(configFile, htmlFile);
    const err4 = err.slice(0, 4);
    const out4 = out.slice(0, 4);

    prettyPrint({ err4, out4, exitCode });

    done();

  });

});
