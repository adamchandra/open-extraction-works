import _ from 'lodash';

import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';

import Async from 'async';

import { Metadata } from '~/spidering/data-formats';
import { putStrLn } from 'commons';
import { Logger } from 'winston';
import { ExtractionRecord } from './extraction-records';

export interface NormalForms {
  'css-norm': null;
  'original': null;
  'tidy-norm': null
}
export type NormalForm = keyof NormalForms;

export type ExtractionEnv = {
  log: Logger;
  entryPath: string;
  extractionRecords: ExtractionRecord[];
  fileContentCache: Record<string, string>;
} & Partial<{
  metaProps: Metadata;
}>;

export type W<A> = [A, ExtractionEnv];
export function asW<A>(a: A, w: ExtractionEnv): W<A> {
  return [a, w];
}

export type ExtractionResultEA<E, A> = TE.TaskEither<E, A>;
export type ExtractionResult<E, A> = TE.TaskEither<W<E>, W<A>>;
export type ExtractionArrow<E, A, B> = (ra: ExtractionResult<E, A>) => ExtractionResult<E, B>;
export type ExtractionEither<E, A> = E.Either<W<E>, W<A>>;

export type ExtractionFunction<E, A, B> = (a: A, env: ExtractionEnv) => ExtractionResult<E, B>;
export type FilterFunction<A> = ExtractionFunction<void, A, void>;
export type EnvFunction<E, B> = ExtractionFunction<E, void, B>;

export const fail = <A>(): TE.TaskEither<void, A> => TE.left(undefined);
export const succeed = <A>(a: A): TE.TaskEither<void, A> => TE.right(a);


export const bind: <E, A, B> (
  name: string,
  f: ExtractionFunction<E, A, B>
) => ExtractionArrow<E, A, B> =
  (name, f) => (ma) => {
    return pipe(
      ma,
      TE.map((wa) => {
        putStrLn(`pre: ${name}`)
        return wa;
      }),
      TE.chain((wa) => {
        const [a, env] = wa;
        return f(a, env);
      }),
      TE.map((wa) => {
        putStrLn(`post(right): ${name} => ${wa[0]}`)
        return wa;
      }),
      TE.mapLeft((wa) => {
        putStrLn(`post(left): ${name}`)
        return wa;
      }),
    );
  };

// bind f(a: A) => B
export const bindFA: <A, B> (
  name: string,
  fab: (a: A, env: ExtractionEnv) => B | undefined
) => ExtractionArrow<void, A, B> =
  (name, fab) => bind(name, (a, env) => {
    const b = fab(a, env);
    if (b === undefined) {
      return TE.left(asW(undefined, env));
    }
    return TE.right(asW(b, env));
  });

// bind f(a: A) => TaskEither<void, B>
export const bindTEva: <A, B> (
  name: string,
  fab: (a: A, env: ExtractionEnv) => TE.TaskEither<void, B> | undefined
) => ExtractionArrow<void, A, B> =
  (name, fab) => bind(name, (a, env) => {
    const b = fab(a, env);
    if (b === undefined) {
      return TE.left(asW(undefined, env));
    }
    return pipe(
      b,
      TE.map(v => asW(v, env)),
      TE.mapLeft(v => asW(v, env))
    );
  });

export type FanoutArrow<E, A, B> = (ra: ExtractionResult<E, A[]>) => ExtractionResult<E, B[]>;

export function separateResults<E, A>(extractionResults: ExtractionResult<E, A>[]): Task.Task<[Array<W<E>>, Array<W<A>>]> {
  return () => Async.mapSeries<ExtractionResult<E, A>, ExtractionEither<E, A>>(
    extractionResults,
    async er => er())
    .then((settled: ExtractionEither<E, A>[]) => {
      const lefts: W<E>[] = [];
      const rights: W<A>[] = [];
      _.each(settled, result => {
        if (isLeft(result)) lefts.push(result.left)
        else rights.push(result.right);
      });
      return [lefts, rights];
    });
}

export const fanout: <E, A, B> (arrow: ExtractionArrow<E, A, B>) => FanoutArrow<E, A, B> =
  <E, A, B>(arrow: ExtractionArrow<E, A, B>) => (ra: ExtractionResult<E, A[]>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[]>) => {
        const [aas, env] = wa;
        const bbs = _.map(aas, (a) => {
          const env0 = _.clone(env);
          return arrow(TE.right(asW(a, env0)));
        });
        const leftRightErrs = separateResults(bbs);
        const rightTasks = pipe(
          leftRightErrs,
          Task.map(([_lefts, rights]) => {
            const bs = _.map(rights, ([b]) => b);
            const recs = _.flatMap(rights, ([, env]) => env.extractionRecords);
            const env0 = _.clone(env);
            env0.extractionRecords.push(...recs);
            return asW(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);
      })
    );
  };

export function filterOn<A>(predicate: (a: A, env: ExtractionEnv) => boolean): FilterFunction<A> {
  const pred = (a: A, env: ExtractionEnv) => {
    if (predicate(a, env)) {
      return TE.right<W<void>, W<void>>(asW(undefined, env));
    }
    return TE.left<W<void>, W<void>>(asW(undefined, env));
  }
  return pred;
}

export function withEnv<E, A>(f: (env: ExtractionEnv) => ExtractionResultEA<E, A>): EnvFunction<E, A> {
  const f0: ExtractionFunction<E, void, A> =
    (_, env) => pipe(
      f(env),
      TE.map(a => asW(a, env)),
      TE.mapLeft(e => asW(e, env)),
    );

  return f0;
}

export function fromNullish<A>(a: A | null | undefined): TE.TaskEither<void, A> {
  return a === null || a === undefined ?
    fail() : succeed(a)
}
