import _ from 'lodash';

import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';


import * as Arr from 'fp-ts/Array';
import { Metadata } from '~/spidering/data-formats';
import { putStrLn } from 'commons';
import { Logger } from 'winston';
import { ExtractionRecord } from './extraction-records';

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

export type ExtractionFunction<E, A, B> = (a: A, env: ExtractionEnv) => ExtractionResult<E, B>;
export type FilterFunction<A> = ExtractionFunction<void, A, void>;
export type EnvFunction<E, B> = ExtractionFunction<E, void, B>;

export const fail = <A>(): TE.TaskEither<void, A> => TE.left(undefined);
export const succeed = <A>(a: A): TE.TaskEither<void, A> => TE.right(a);


export const bind: <E, A, B> (name: string, f: ExtractionFunction<E, A, B>) => ExtractionArrow<E, A, B> =
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

export const bindFA: <E, A, B> (name: string, fab: (a: A) => B) => ExtractionArrow<E, A, B> =
  (name, fab) => bind(name, (a, env) => {
    const b = fab(a);
    return TE.right(asW(b, env));
  });

export type FanoutArrow<E, A, B> = (ra: ExtractionResult<E, A[]>) => ExtractionResult<E, B[]>;

const sequenceArrOfTaskEither = Arr.array.sequence(TE.taskEitherSeq);

export const fanout: <E, A, B> (arrow: ExtractionArrow<E, A, B>) => FanoutArrow<E, A, B> =
  <E, A, B>(arrow: ExtractionArrow<E, A, B>) => (ra: ExtractionResult<E, A[]>) =>  {
    return pipe(
      ra,
      TE.chain((wa: W<A[]>) => {
        const [aas, env] = wa;
        // TODO clone envs
        const bbs = _.map(aas, (a) => arrow(TE.right(asW(a, env))));
        const bbSeq = sequenceArrOfTaskEither(bbs);
        return pipe(
          bbSeq,
          TE.map((wbs: W<B>[]) => {
            // TODO Combine Ws
            // const ws = _.map(wbs, ([, w]) => w);
            const bs = _.map(wbs, ([b]) => b);
            return asW(bs, env);
          })
        );
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
