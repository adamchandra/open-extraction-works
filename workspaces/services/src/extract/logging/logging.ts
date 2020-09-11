import _ from 'lodash';
import path from 'path';
import fs from 'fs-extra';
import { initBufferedLogger, BufferedLogger } from 'commons';
import { Metadata } from '~/spidering/data-formats';

export function resolveLogfileName(logpath: string, phase: string): string {
  return path.resolve(logpath, logfileName(phase));
}

export function logfileName(phase: string): string {
  return `qa-review-${phase}-log.json`;
}

export function initLogger(logpath: string, phase: string, append = false): BufferedLogger {
  const logname = resolveLogfileName(logpath, phase);
  if (fs.existsSync(logname)) {
    if (!append) {
      throw new Error(
        `log ${logname} already exists. Move or delete before running`,
      );
    }
  }
  // const fst = () => newFileStreamTransport(logpath)
  return initBufferedLogger(logname);
}


export function readMetadata(metafile: string): Metadata | undefined {
  if (!fs.existsSync(metafile)) return;
  const metaJson = fs.readJsonSync(metafile);
  return metaJson;
}
