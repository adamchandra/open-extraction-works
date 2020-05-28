import _ from "lodash";
import path from "path";
import fs from "fs-extra";
import { Stream } from "stream";
import pumpify from "pumpify";
import es from "event-stream";
import urlparse from "url-parse";

import { initBufferedLogger, BufferedLogger } from "commons";
import { filterStream } from "commons";
import { ExpandedDir } from "commons";
import { ReviewEnv } from '~/extract/qa-review-abstracts';

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
  return initBufferedLogger(logname);
}

export function writeDefaultEntryLogs(
  log: BufferedLogger,
  entryDir: ExpandedDir,
  env: ReviewEnv,
): void {
  const propfile = path.join(entryDir.dir, "entry-props.json");
  const metafile = path.join(entryDir.dir, "meta");

  log.setHeader("entry", entryDir.dir);

  if (fs.existsSync(metafile)) {
    const metaPropsBuf = fs.readFileSync(metafile);
    const metaPropsStr = metaPropsBuf.toString();
    const fixed = _.replace(metaPropsStr, /'/g, '"');
    const metaProps = JSON.parse(fixed);
    const { url, response_url } = metaProps;
    const urlp = urlparse(url);
    log.append(`entry.url=${url}`);
    log.append(`entry.url.host=${urlp.host}`);
    log.append(`entry.response_url=${response_url}`);
    // get the original url from the meta/csv

    const fetchChain = env.urlGraph.getUrlFetchChain(url);
    const maybeOriginalUrl = _.map(fetchChain, furl => env.csvLookup[furl])
      .filter(d => d !== undefined);

    // prettyPrint({ maybeOriginalUrl });

    if (maybeOriginalUrl.length>0) {
      const originalRec = maybeOriginalUrl[0];
      const { noteId  } = originalRec;
      log.append(`entry.noteId=${noteId}`);
      log.append(`entry.url.original=${originalRec.url}`);
      // log.append(`entry.venue.original=${originalRec.url}`);
    }


    // TODO: HACK! REMOVE!
    const responseBodyFile = path.join(entryDir.dir, "response_body");
    const responseBodyHtml = path.join(entryDir.dir, "download.html");
    const responseHeadersFile = path.join(entryDir.dir, "response_headers");

    if (fs.existsSync(responseBodyHtml)) return;

    const responseHeadersBuf = fs.readFileSync(responseHeadersFile).toString();

    const maybeContentType = responseHeadersBuf
      .split("\n")
      .filter(l => l.startsWith('Content-Type'))
      .map(l => l.split(":"))
      .map(la => la[1])[0];

    if (maybeContentType.includes('html')) {
      log.append(`entry.contentType=html`);
      if (! fs.existsSync(responseBodyHtml)) {
        console.log('copying response_body to download.html');
        fs.copyFileSync(responseBodyFile, responseBodyHtml);
      }
    } else {
      log.append(`entry.contentType=unknown`);
    }

    return;
  }

  if (!fs.existsSync(propfile)) return;

  const entryProps = fs.readJsonSync(
    path.join(entryDir.dir, "entry-props.json"),
  );

  const dblpId: string = entryProps.dblpConfId;
  const [, , venue, year] = dblpId.split("/");
  const url: string = entryProps.url;
  const urlp = urlparse(url);

  log.append(`entry.url=${url}`);
  log.append(`entry.url.host=${urlp.host}`);
  log.append(`entry.venue=${venue}`);
  log.append(`entry.venue.year=${year}`);
}


export function createFilteredLogStream(
  logfile: string,
  filters: RegExp[],
): Stream {
  const logExists = fs.existsSync(logfile);
  if (!logExists) {
    console.log(`ERROR: no log ${logfile}`);
  }
  const logReader: fs.ReadStream = fs.createReadStream(logfile);

  return pumpify.obj(
    logReader,
    es.split(),
    es.parse(),

    filterStream((chunk: any) => {
      if (filters.length === 0) return true;

      const statusLogs: string[] = chunk.message.logBuffer;
      return _.every(filters, f => _.some(statusLogs, l => f.test(l)));
    }),
  );
}
