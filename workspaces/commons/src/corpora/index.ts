//
import { Readable } from "stream";
import hash from "object-hash";
import { getDirWalkerStream, stringStreamFilter } from "./dirstream";
import fs from "fs-extra";
import { throughFunc } from '~/util/stream-utils';

export interface CorpusArtifact {
  corpusEntry: CorpusEntry;
  artifactType: string;
  path: string;
}

export interface CorpusEntry {
  entryId: string;
  path: string;
}

export function makeCorpusEntryLeadingPath(s: string): string {
  const sHash = hash(s, { algorithm: "sha1", encoding: "hex" });
  const leadingPath = sHash
    .slice(0, 2)
    .split("")
    .join("/");
  return leadingPath;
}

export interface ExpandedDir {
  dir: string;
  files: string[];
}


export function corpusEntryStream(corpusRoot: string): Readable {
  const corpusDirStream = getDirWalkerStream(corpusRoot);

  const entryDirFilter = stringStreamFilter((dir: string) => {
    return /[/][^/]+\.d$/.test(dir);
  });

  return corpusDirStream.pipe(entryDirFilter);
}

export function expandDir(path: string): ExpandedDir {
  const dirEntries = fs.readdirSync(path, { withFileTypes: true });
  const files = dirEntries
    .filter(dirent => dirent.isFile())
    .map(dirent => dirent.name);

  const res: ExpandedDir = {
    dir: path,
    files,
  };
  return res;
}

export const expandDirTrans = throughFunc(expandDir);
