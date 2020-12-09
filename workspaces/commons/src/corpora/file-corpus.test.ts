
import 'chai/register-should';

import _ from 'lodash';
import through from 'through2';
import { expandDirRecursive, getDirWalkerStream } from './dirstream';
import { prettyPrint } from '~/util/pretty-print';

describe('File corpus operations',  () => {
  const testDirPath = './test/resources/test-dirs';

  it('should traverse all files/directories using readable stream', async (done) => {

    const filesRead: string[] = [];

    const dirStream = getDirWalkerStream(testDirPath, false);

    dirStream.pipe(through.obj(
      (chunk: string, _enc: string, next: (err: any, v: any) => void) => {
        filesRead.push(chunk);
        next(null, chunk);
      },
      (end) => {
        prettyPrint({ filesRead });
        end();
        done();
      }
    ));
  });

  it.only('should full expand a directory of files', async (done) => {
    const expanded = await expandDirRecursive(testDirPath, true, false);
    prettyPrint({ expanded })
    done();
  });


});
