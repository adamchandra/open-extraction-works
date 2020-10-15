import _ from 'lodash';
import path from 'path';
import fs, { } from 'fs-extra';
import stream, { Readable, Transform } from 'stream';
import through from 'through2';

interface DirStackEntry {
  fullpath: string;
  expanded: boolean;
  files: string[];
}

export function getDirWalkerStream(root: string, includeFiles?: boolean): Readable {
  const incFiles = includeFiles || false;
  const stack: DirStackEntry[] = [{ fullpath: root, expanded: false, files: [] }];

  function expand(): DirStackEntry | undefined {
    let top = _.last(stack)
    while (top && !top.expanded) {
      const topPath = top.fullpath;
      const dirEntries = fs.readdirSync(top.fullpath, { withFileTypes: true });
      let fileNames: string[] = [];
      if (incFiles) {
        fileNames = _(dirEntries)
          .filter(e => e.isFile())
          .map(e => e.name)
          .sort()
          .map(e => path.join(topPath, e))
          .value();
      }

      const dirNames = _(dirEntries)
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
        .reverse()
        .map(e => {
          const fullpath = path.join(topPath, e);
          return {
            fullpath,
            expanded: false,
            files: []
          }
        })
        .value();

      top.expanded = true;
      top.files.push(...fileNames)
      stack.push(...dirNames);
      top = _.last(stack)
    }
    const next = stack.pop();
    return next;
  }

  const streamOut = new stream.Readable({
    objectMode: true,
    read() {
      const data = expand();
      if (data) {
        this.push(data.fullpath);
        data.files.forEach(f => this.push(f));
        return;
      }
      this.push(null)
    }
  });

  return streamOut;
}

export function stringStreamFilter(test: (p: string) => boolean): Transform {
  return through.obj(
    (chunk: string, _enc: string, next: (err: any, v: string | null) => void) => {
      if (test(chunk)) {
        return next(null, chunk);
      }
      return next(null, null);
    }
  );
}
