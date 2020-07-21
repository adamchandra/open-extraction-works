import * as TE from 'fp-ts/lib/TaskEither';
import * as Arr from 'fp-ts/lib/Array';
import { pipe } from 'fp-ts/lib/pipeable';
import _ from "lodash";
import { MetaFile } from '../logging/logging';
import { diffByChars, Change } from 'commons';
import { ExtractionRecord } from './extraction-records';

export interface Field {
  name: string;
  evidence: string[];
  value?: string;
}

interface NormalForms {
  'css-normal': null;
  'response-body': null;
  'html-tidy': null
}

export interface CleaningRule {
  name: string;
  guards: RegExp[];
  run(str: string, guards: RegExp[]): string | undefined;
}

export interface CleaningRuleResult {
  rule: string;
  changes: Change[]
}

export function applyCleaningRules(rules: CleaningRule[], initialString: string): [string, CleaningRuleResult[]] {
  let currentString = initialString;
  const cleaningResults: CleaningRuleResult[] = [];
  _.each(rules, (rule) => {
    const someGuardMatches = (
      rule.guards.length === 0
      || rule.guards.some(re => re.test(currentString))
    );

    if (!someGuardMatches) return;

    const cleaned = rule.run(currentString, rule.guards);
    if (cleaned === undefined) return;
    if (cleaned !== currentString) {
      const changes = diffByChars(currentString, cleaned, { brief: true });
      cleaningResults.push({
        rule: rule.name,
        changes,
      });
      currentString = cleaned;
    }
  });
  return [currentString, cleaningResults];
}
export type NormalForm = keyof NormalForms;

interface FileContentValue {
  lines: string[];
  content: string;
}

export interface ExtractionEnv {
  entryPath: string;
  metaProps: MetaFile;
  responseMimeType: string;
  fileContentMap: { [k in keyof NormalForms]?: FileContentValue };
  extractionRecord: ExtractionRecord;
  evidence: string[];
  verbose: boolean;
}

export type ExtractionResult = TE.TaskEither<string, ExtractionEnv>;
export type ExtractionFunction = (env: ExtractionEnv) => ExtractionResult;

export const tapWith: (f: (env: ExtractionEnv) => void) => ExtractionFunction =
  f => env => {
    const originalEnv = _.merge({}, env);
    f(env);
    return TE.right(originalEnv);
  };

export const modEnv: (f: (env: ExtractionEnv) => ExtractionEnv) => ExtractionFunction =
  f => env => {
    const newEnv = f(env);
    return TE.right(newEnv);
  };

export const resetEnvForAttemptChain: ExtractionFunction =
  env => {
    // env.extractionEvidence = [];
    if (env.verbose) {
      console.log('resetEnvForAttemptChain');
    }
    return TE.right(env);
  };

export function extractionSuccess(result: ExtractionEnv): ExtractionResult {
  return TE.right<string, ExtractionEnv>(result);
}

export function fatalFailure(result: string): ExtractionResult {
  return TE.left<string, ExtractionEnv>(`FATAL: ${result}`);
}
export function nonFatalFailure(result: string): ExtractionResult {
  return TE.left<string, ExtractionEnv>(`WARN: ${result}`);
}

export type BindFunction<E, A> = (env: A) => TE.TaskEither<E, A>;

export function flatMapTasksEA<E = unknown, A = unknown>(
  fs: BindFunction<E, A>[]
): BindFunction<E, A> {

  const zero: BindFunction<E, A> = (env) => TE.right(env)

  const result = Arr.array.reduce(fs, zero, (
    acc: BindFunction<E, A>,
    el: BindFunction<E, A>
  ) => {
    return (env0: A) => pipe(
      TE.right(env0),
      TE.chain(env => acc(env)),
      TE.chain(env => el(env))
    );
  });

  return result;
}
