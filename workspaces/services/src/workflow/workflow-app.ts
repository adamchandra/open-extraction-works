import _ from "lodash";
import { AlphaRecord } from 'commons';

import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';
import * as T from 'fp-ts/lib/Task';
import * as E from 'fp-ts/lib/Either';
import isUrl from 'is-url-superb';

export interface WorkflowEnv {
  alphaRecord: AlphaRecord;
  corpusId: string;
  errorMessage: string;
}

// TODO undo this copypasta
export interface WithEnv<A, Env> {
  kind: 'WithEnv',
  a: A;
  env: Env
}

type AWithEnv<A> = WithEnv<A, WorkflowEnv>;
export type ExtractionResult<R, Err> = TE.TaskEither<AWithEnv<Err>, AWithEnv<R>>;

export type Success<A> = T.Task<E.Right<A>>;
export type ExtractionSuccess<A> = T.Task<E.Right<AWithEnv<A>>>;

export type ExtractionFunction<A, Err, R> = (aenv: AWithEnv<A>) => ExtractionResult<R, Err>;
export type ModEnv<A, R, Env> = (env: WithEnv<A, Env>) => WithEnv<R, Env>;
export type ReadEnv<A, R, Env> = (env: WithEnv<A, Env>) => R;

export function success<A>(a: A): ExtractionResult<A> {
  return T.of(E.right<string, A>(a));
}

export function failure<Err, A>(e: Err): TE.TaskEither<Err, A> {
  return TE.left(e);
}

export function readEnv<A, R, Env>(
  f: (e: Env) => R,
  wenv: WithEnv<A, Env>
): WithEnv<R, Env> {
  const a = f(wenv.env);
  return {
    kind: 'WithEnv',
    a,
    env: wenv.env
  };
}

// export function chainReadEnv<A, R, Err, Env>(f: ReadEnv<A, R, Env>): ExtractionResult<R, Err> {
//   const reader = (wenv: WithEnv<A, Env>) => {
//     const r = f(wenv);
//     const rEnv: WithEnv<R, Env> = {
//       kind: 'WithEnv',
//       a: r,
//       env: wenv.env
//     };
//     return success(rEnv);
//   };
// }

// <A, B>((e: AWithEnv<A>) => B) => <B>(b: B) => ExtractionFunction<B, Err, C> = {}
// export const chainReadEnv: <A, B>((e: AWithEnv<A>) => B) => <B>(b: B) => ExtractionFunction<B, Err, C> = {}


export async function runExtractionWorkflow(
  alphaRecords: AlphaRecord[]
): Promise<void> {
  // record recs
}

export interface FieldsResponse {
  kind: 'fields';

}
export interface ErrorResponse {
  kind: 'error';

}
export interface PendingResponse {
  kind: 'pending';

}

export type RestResponse =
  FieldsResponse;

export async function restPortalIngress(
  alphaRecords: AlphaRecord[]
): Promise<RestResponse[]> {
  // filter out records w/invalid urls
  // upsert records
  // gather available fields/error/etc for response
  //

  return [];
}

//
export async function enqueueAlphaRecords(
  alphaRecords: AlphaRecord[]
): Promise<void> {
  //
}

export async function filterValidURLs(
  alphaRecords: AlphaRecord[]
): Promise<void> {
  //
}
