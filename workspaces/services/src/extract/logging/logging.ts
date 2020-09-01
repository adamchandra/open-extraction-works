import _ from "lodash";
import path from "path";
import fs from "fs-extra";
import { Stream } from "stream";
import pumpify from "pumpify";
import split from 'split';

import { initBufferedLogger, BufferedLogger } from "commons";
import { filterStream } from "commons";

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

export interface MetaFile {
  url: string;
  responseUrl: string;
  status: number;
}

export function readMetaFile(metafile: string): MetaFile | undefined {
  if (!fs.existsSync(metafile)) return;

  const metaPropsBuf = fs.readFileSync(metafile);
  const metaPropsStr = metaPropsBuf.toString();
  const fixed = _.replace(metaPropsStr, /'/g, '"');
  const metaProps = JSON.parse(fixed);
  const { url, response_url, status } = metaProps;
  return {
    url,
    status,
    responseUrl: response_url,
  };
}
