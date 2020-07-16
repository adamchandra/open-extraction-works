import _ from "lodash";
import { Readable } from "stream";
import { dirstream, stringStreamFilter, ExpandedDir, expandDir } from 'commons';
import path from "path";
import fs from "fs-extra";


// TODO many of the spidering-corpus functions can be pushed into the commons lib
export function walkScrapyCacheCorpus(corpusRoot: string): Readable {
  const corpusDirStream = dirstream(corpusRoot);

  const entryDirFilter = stringStreamFilter((dir: string) => {
    const shaHexRE = /[\dabcdefABCDEF]{40}[/]?$/;
    return shaHexRE.test(dir);
  });

  return corpusDirStream.pipe(entryDirFilter);
}

const artifactSubdirO = {
  '.': null,
  'spidering-logs': null,
  'cache': null,
  'ground-truth': null,
  'extracted-fields': null,
};

type artifactSubdirT = typeof artifactSubdirO;
export type ArtifactSubdir = keyof artifactSubdirT;

const artifactSubdirs: ArtifactSubdir[] = [
  '.',
  'spidering-logs',
  'cache',
  'ground-truth',
  'extracted-fields',
]

export function resolveCorpusFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): string {
  return path.resolve(entryPath, artifactDir, corpusFilename);
}
export function ensureArtifactDir(entryPath: string, artifactDir: ArtifactSubdir): void {
  const artifactDirPath = path.resolve(entryPath, artifactDir);
  const artifactDirExists = fs.existsSync(artifactDirPath);
  if (artifactDirExists) return;

  fs.mkdirSync(artifactDirPath);
}

export function hasCorpusFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): boolean {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return fs.existsSync(filePath);
}

export function listCorpusArtifacts(entryPath: string, artifactDir: ArtifactSubdir): ExpandedDir {
  const p = path.resolve(entryPath, artifactDir);
  return expandDir(p);
}

export function readCorpusJsonFile<T>(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): T | undefined {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readJsonOrUndef(filePath);
}

export function readCorpusJsonFileAsync<T>(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): Promise<T | undefined> {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readJsonOrUndefAsync(filePath);
}

export function readCorpusTextFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): string | undefined {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readTextOrUndef(filePath);
}
export function readCorpusTextFileAsync(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): Promise<string | undefined> {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readTextOrUndefAsync(filePath);
}

export function writeCorpusJsonFile<T>(entryPath: string, artifactDir: ArtifactSubdir, filename: string, content: T): boolean {
  ensureArtifactDir(entryPath, artifactDir);
  const filePath = resolveCorpusFile(entryPath, artifactDir, filename);
  return writeJson(filePath, content);
}
export function writeCorpusTextFile(entryPath: string, artifactDir: ArtifactSubdir, filename: string, content: string): boolean {
  ensureArtifactDir(entryPath, artifactDir);
  const filePath = resolveCorpusFile(entryPath, artifactDir, filename);
  return writeText(filePath, content);
}

export function updateCorpusJsonFile<T=never>(
  entryPath: string,
  artifactDir: ArtifactSubdir,
  filename: string,
  modf: (prev?: T) => T
): void {
  ensureArtifactDir(entryPath, artifactDir);
  const artifactPath = resolveCorpusFile(entryPath, artifactDir, filename);
  const maybePrev = readJsonOrUndef<T>(artifactPath);
  const update = modf(maybePrev);
  const changed = !_.isEqual(maybePrev, update);
  if (changed) {
    if (maybePrev !== undefined) {
      fs.unlinkSync(artifactPath);
    }
    writeJson(artifactPath, update);
  }
}

function readJsonOrUndef<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return;
  return fs.readJsonSync(filePath);
}
async function readJsonOrUndefAsync<T>(filePath: string): Promise<T | undefined> {
  if (!fs.existsSync(filePath)) return;
  return fs.readJson(filePath);
}

export function writeJson<T>(filePath: string, obj: T): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.writeJsonSync(filePath, obj);
  return true;
}

function readTextOrUndef(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return;
  return fs.readFileSync(filePath).toString();
}

async function readTextOrUndefAsync(filePath: string): Promise<string | undefined> {
  if (!fs.existsSync(filePath)) return;
  return fs.readFile(filePath).then(b => b.toString())
}

function writeText(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

export function resolveEntryPath(entryPath: string, subPath: string): string {
  return path.resolve(entryPath, subPath);
}

export const ensureArtifactDirectories = (entryPath: string): void => {
  _.each(artifactSubdirs, d => {
    const artifactPath = resolveEntryPath(entryPath, d);
    const artifactDirExists = fs.existsSync(artifactPath);
    if (!artifactDirExists) {
      fs.mkdirSync(artifactPath);
    }
  });
};
