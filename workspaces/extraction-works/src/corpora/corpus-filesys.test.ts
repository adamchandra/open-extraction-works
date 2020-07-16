import "chai/register-should";

import _ from "lodash";
import { updateCorpusJsonFile, readCorpusJsonFile } from './corpus-file-walkers';
import { initTestCorpusDirs } from '~/openreview/test-utils';
import { prettyPrint } from 'commons/dist';
import path from "path";
import fs from "fs-extra";

describe("Corpus filesystem access utilities", () => {
  const scratchTestDir = 'test-tmp.d';

  beforeEach(() => {
    fs.emptyDirSync(scratchTestDir);
  });

  // it("should stream corpus entry directories", () => {});

  it("should read/write/update artifact files", () => {

    interface Foo {
      count: number;
    }

    const { corpusRoot, corpusPath } = initTestCorpusDirs(scratchTestDir);
    prettyPrint({ corpusPath, corpusRoot });
    const entry0Path = path.resolve(corpusPath, 'corpus-entry0');
    fs.mkdirSync(entry0Path);
    _.each(_.range(10), () => {
      updateCorpusJsonFile<Foo>(
        entry0Path, 'cache', 'cached-text.txt',
        (prev: any) => {
          if (!prev) {
            return { count: 0 };
          }

          return { count: prev.count + 1 };
        });
    });
    const finalUpdate = readCorpusJsonFile<Foo>(entry0Path, 'cache', 'cached-text.txt');
    expect(finalUpdate).toMatchObject({ count: 9 });

  });
});
