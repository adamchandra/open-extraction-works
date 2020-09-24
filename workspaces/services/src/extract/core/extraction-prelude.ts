import _ from 'lodash';

import { pipe, flow } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as Arr from 'fp-ts/Array';
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
// TODO rename this (arrow to ???):
export type ExtractionArrow<E, A, B> = (ra: ExtractionResult<E, A>) => ExtractionResult<E, B>;
export type FilterArrow<A> = ExtractionArrow<void, A, A>;
export type ExtractionEither<E, A> = E.Either<W<E>, W<A>>;

export type ExtractionFunction<E, A, B> = (a: A, env: ExtractionEnv) => ExtractionResult<E, B>;
export type FilterFunction<E, A> = ExtractionFunction<E, A, A>;
export type EnvFunction<E, B> = ExtractionFunction<E, void, B>;

export const failure = <A>(): TE.TaskEither<void, A> => TE.left(undefined);

export const success = <A>(a: A): TE.TaskEither<void, A> => TE.right(a);
export const success_ = (): TE.TaskEither<void, void> => TE.right(undefined);

export const voidResult: <A>() => ExtractionArrow<void, A, void> =
  () => (er) => pipe(
    er,
    TE.chain(([,env]) => {
      return TE.right(asW(undefined, env));
    }));


export const bind_: <E, A, B> (
  f: ExtractionFunction<E, A, B>
) => ExtractionArrow<E, A, B> =
  (f) => (ma) => {
    return pipe(
      ma,
      TE.chain(([a, env]) => f(a, env)),
    );
  };

export const bind: <E, A, B> (
  name: string,
  f: ExtractionFunction<E, A, B>
) => ExtractionArrow<E, A, B> =
  (name, f) => (ma) => {
    return pipe(
      ma,
      TE.map((wa) => {
        // TODO alter logger to prepend processor name
        // putStrLn(`[${name}]`)
        return wa;
      }),
      TE.chain((wa) => {
        const [a, env] = wa;
        return f(a, env);
      }),
      TE.map((wa) => {
        putStrLn(`[${name}]> Okay: ${wa[0]}`)
        // putStrLn(`[${name}]> Okay`)
        return wa;
      }),
      TE.mapLeft((wa) => {
        // TODO alter logger level to error
        putStrLn(`[${name}]> Error`)
        return wa;
      }),
    );
  };

// bind f(a: A) => B
export const bindFA: <A, B> (
  name: string,
  fab: (a: A, env: ExtractionEnv) => B
) => ExtractionArrow<void, A, B> =
  (name, fab) => bind(name, (a, env) => {
    const b = fab(a, env);
    return TE.right(asW(b, env));
  });

// // bind f(a: A) => B
// export const bindFA: <A, B> (
//   name: string,
//   fab: (a: A, env: ExtractionEnv) => B | undefined
// ) => ExtractionArrow<void, A, B> =
//   (name, fab) => bind(name, (a, env) => {
//     const b = fab(a, env);
//     if (b === undefined) {
//       return TE.left(asW(undefined, env));
//     }
//     return TE.right(asW(b, env));
//   });

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

export const bindArrow: <E, A, B> (
  name: string,
  arrow: ExtractionArrow<E, A, B>
) => ExtractionArrow<E, A, B> =
  (name, arrow) => bind(name, (a, env) => {
    return pipe(
      TE.right(asW(a, env)),
      arrow
    );
  });

export type FanoutArrow<E, A, B> = (ra: ExtractionResult<E, A[]>) => ExtractionResult<E, B[]>;
export type FaninArrow<E, A, B> = (ra: ExtractionResult<E, A[]>) => ExtractionResult<E, B>;

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


export const firstOf: typeof flow = flow;

export const forEachDo: <E, A, B> (arrow: ExtractionArrow<E, A, B>) => FanoutArrow<E, A, B> =
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

export const attempt: <E, A, B> (
  arrow: ExtractionArrow<E, A, B>
) => ExtractionArrow<E, A, A> =
  <E, A, B>(arrow: ExtractionArrow<E, A, B>) => (ra: ExtractionResult<E, A>) => {
    return pipe(
      ra,
      arrow,
      TE.chain(() => ra)
    );
  };

// TODO: This is actually Fanout
// Given a single input A, produce an array of Bs by running the given array of functions on the initial A
export const attemptAll: <E, A, B> (...arrows: ExtractionArrow<E, A, B>[]) => ExtractionArrow<E, A, B[]> =
  <E, A, B>(...arrows: ExtractionArrow<E, A, B>[]) => (ra: ExtractionResult<E, A>) => {
    // const attempts = _.map(arrows, a => attempt(a));
    // const sdf  = Arr.traverse(TE.taskEither)((s) => TE.right(s))
    return pipe(
      ra,
      TE.chain(([a, env]: W<A>) => {
        const bbs = _.map(arrows, (arrow) => {
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

export const fanin: <E, A, B> (arrow: ExtractionArrow<E, A[], B>) => ExtractionArrow<E, A[], B> =
  <E, A, B>(arrow: ExtractionArrow<E, A[], B>) => (ra: ExtractionResult<E, A[]>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[]>) => {
        return arrow(TE.right(wa));
      })
    );
  };

export function filterOn<A>(predicate: (a: A, env: ExtractionEnv) => boolean | Promise<boolean>): FilterFunction<void, A> {
  return (a: A, env: ExtractionEnv) => {
    const b = Promise.resolve(predicate(a, env));
    return b
      ? TE.right<W<void>, W<A>>(asW(a, env))
      : TE.left<W<void>, W<A>>(asW(undefined, env));
  };
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
    fail() : success(a)
}

export function through<E, A, B>(f: (a: A, env: ExtractionEnv) => B | Promise<B>): ExtractionArrow<E, A, B> {
  return (ra: ExtractionResult<E, A>) => {
    return pipe(
      ra,
      TE.chain(([a, env]) => {
        const wer = Promise.resolve(f(a, env))
          .then(b => E.right<W<E>, W<B>>(asW(b, env)))
        return () => wer;
      })
    );
  };
}
