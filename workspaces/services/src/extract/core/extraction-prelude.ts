import _ from 'lodash';

import { pipe, flow } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as Arr from 'fp-ts/Array';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';

import Async from 'async';

import { Metadata } from '~/spidering/data-formats';
import { setLogLabel } from 'commons';
import { Logger } from 'winston';
import { ExtractionRecord } from './extraction-records';

export interface NormalForms {
  'css-norm': null;
  'original': null;
  'tidy-norm': null
}
export type NormalForm = keyof NormalForms;

export type ControlCode = 'halt' | 'continue';
export type ControlInstruction = ControlCode | [ControlCode, string];

export type ExtractionEnv = {
  log: Logger;
  logPrefix: string[];
  entryPath: string;
  metadata: Metadata;
  extractionRecords: ExtractionRecord[];
  fileContentCache: Record<string, string>;
};

export type W<A> = [A, ExtractionEnv];
export function asW<A>(a: A, w: ExtractionEnv): W<A> {
  return [a, w];
}

export type WCI = W<ControlInstruction>;

export type Eventual<A> = A | Promise<A>;
export type ClientFunc<A, B> = (a: A, env: ExtractionEnv) => Eventual<B>;


export function eventualToResult<A>(a: Eventual<A>, env: ExtractionEnv): ExtractionResult<A> {
  return () => Promise.resolve(a)
    .then(a0 => E.right(asW(a0, env)));
}

export type ExtractionResultEA<A> = TE.TaskEither<ControlInstruction, A>;
export type ExtractionResult<A> = TE.TaskEither<WCI, W<A>>;
// TODO rename this (arrow to ???):
export type ExtractionArrow<A, B> = (ra: ExtractionResult<A>) => ExtractionResult<B>;
export type FilterArrow<A> = ExtractionArrow<A, A>;
export type ExtractionEither<A> = E.Either<WCI, W<A>>;

export type ExtractionFunction<A, B> = (a: A, env: ExtractionEnv) => ExtractionResult<B>;
export type FilterFunction<A> = ExtractionFunction<A, A>;
export type EnvFunction<B> = ExtractionFunction<void, B>;

export type FanoutArrow<A, B> = (ra: ExtractionResult<A[]>) => ExtractionResult<B[]>;
export type FaninArrow<A, B> = (ra: ExtractionResult<A[]>) => ExtractionResult<B>;

export const failure = <A>(msg: string = 'reason unspecified'): TE.TaskEither<ControlInstruction, A> => TE.left(['halt', msg]);

export const success = <A>(a: A): TE.TaskEither<ControlInstruction, A> => TE.right(a);
export const success_ = (): TE.TaskEither<ControlInstruction, void> => TE.right(undefined);

export const voidResult: <A>() => ExtractionArrow<A, void> =
  () => (er) => pipe(
    er,
    TE.chain(([, env]) => {
      return TE.right(asW(undefined, env));
    }));


export const bind_: <A, B> (
  f: ExtractionFunction<A, B>
) => ExtractionArrow<A, B> =
  (f) => (ma) => {
    return pipe(
      ma,
      TE.chain(([a, env]) => f(a, env)),
    );
  };

export const bind: <A, B> (
  name: string,
  fab: ExtractionFunction<A, B>
) => ExtractionArrow<A, B> =
  (name, fab) => (ma) => {
    return pipe(
      ma,
      TE.map((wa) => {
        const [, env] = wa;
        const { log, logPrefix } = env;
        logPrefix.push(name);
        setLogLabel(log, _.join(logPrefix, '/'))
        log.debug('_begin_');
        return wa;
      }),
      TE.chain((wa) => {
        const [a, env] = wa;
        return fab(a, env);
      }),
      TE.map((wa) => {
        const [, env] = wa;
        const { log, logPrefix } = env;
        // log.info('_end_right_');
        logPrefix.pop();
        setLogLabel(log, _.join(logPrefix, '/'))
        return wa;
      }),
      TE.mapLeft((wa) => {
        const [code, env] = wa;
        const { log, logPrefix } = env;

        log.info(`_end_left_:  ${code}`);

        switch (code) {
          case undefined:
            break;
          case 'halt':
            break;
          case 'continue':
            break;
          default:
            break;
        }
        logPrefix.pop();
        setLogLabel(log, _.join(logPrefix, '/'))
        return wa;
      }),
    );
  };

// bind f(a: A) => B
export const bindFA: <A, B> (
  name: string,
  fab: ClientFunc<A, B>
) => ExtractionArrow<A, B> =
  (name, fab) => bind(name, (a, env) => {
    return eventualToResult(fab(a, env), env);
  });

// bind f(a: A) => TaskEither<void, B>
export const bindTEva: <A, B> (
  name: string,
  fab: (a: A, env: ExtractionEnv) => TE.TaskEither<ControlInstruction, B>
) => ExtractionArrow<A, B> =
  (name, fab) => bind(name, (a, env) => {
    const b = fab(a, env);
    if (b === undefined) {
      env.log.warn('function returned undefined; deprecated');
      return TE.left(asW('continue', env));
    }
    return pipe(
      b,
      TE.map(v => asW(v, env)),
      TE.mapLeft(v => asW(v, env))
    );
  });

export const bindArrow: <A, B> (
  name: string,
  arrow: ExtractionArrow<A, B>
) => ExtractionArrow<A, B> =
  (name, arrow) => bind(name, (a, env) => {
    return pipe(
      TE.right(asW(a, env)),
      arrow
    );
  });

export function firstSuccess<A>(extractionResults: ExtractionResult<A>[], env: ExtractionEnv): ExtractionResult<A> {
  let finalResult: ExtractionResult<A>  =
    TE.left(asW(['halt', 'no match found in firstOf'], env));

  const qwe = Async.detectSeries<ExtractionResult<A>>(
    extractionResults,
    (result, callback) => {
      pipe(
        result,
        TE.map(() => callback(null, true)),
        TE.mapLeft(() => callback(null, false))
      );
      return
    },
    async (err, result) => {
      if (err instanceof Error) {
        finalResult = TE.left(asW(['halt', err.message], env));
      }

      if (result === undefined) {
        finalResult = TE.left(asW(['halt', 'no match found in firstOf'], env))
      }
      resolve(result);
    }
  );
}

export function separateResults<A>(extractionResults: ExtractionResult<A>[]): Task.Task<[Array<W<ControlInstruction>>, Array<W<A>>]> {
  return () => Async.mapSeries<ExtractionResult<A>, ExtractionEither<A>>(
    extractionResults,
    async er => er())
    .then((settled: ExtractionEither<A>[]) => {
      const lefts: WCI[] = [];
      const rights: W<A>[] = [];
      _.each(settled, result => {
        if (isLeft(result)) lefts.push(result.left)
        else rights.push(result.right);
      });
      return [lefts, rights];
    });
}


export const firstOf: typeof flow = flow;

export const forEachDo: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
  <A, B>(arrow: ExtractionArrow<A, B>) => (ra: ExtractionResult<A[]>) => {
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

export const fanout: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
  <A, B>(arrow: ExtractionArrow<A, B>) => (ra: ExtractionResult<A[]>) => {
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

export const attempt: <A, B> (
  arrow: ExtractionArrow<A, B>
) => ExtractionArrow<A, A> =
  <A, B>(arrow: ExtractionArrow<A, B>) => (ra: ExtractionResult<A>) => {
    return pipe(
      ra,
      arrow,
      TE.fold(
        () => ra,
        () => ra,
      ),
    );
  };

// TODO: This is actually Fanout
// Given a single input A, produce an array of Bs by running the given array of functions on the initial A
export const attemptAll: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B[]> =
  <A, B>(...arrows: ExtractionArrow<A, B>[]) => (ra: ExtractionResult<A>) => {
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

// Try each arrow on input until one succeeds
export const firstOf0: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B> =
  <A, B>(...arrows: ExtractionArrow<A, B>[]) => (ra: ExtractionResult<A>) => {
    return pipe(
      ra,
      TE.chain(([a, env]: W<A>) => {
        const appliedArrows = _.map(arrows, (arrow) => {
          const env0 = _.clone(env);
          const result = arrow(TE.right(asW(a, env0)));
          return result;
          // return pipe(
          //   result,
          // )
        });

        const maybeFirstRight = new Promise<ExtractionResult<B>>((resolve) => {
          Async.detectSeries(
            appliedArrows,
            async (result, callback) => {
              return pipe(
                result,
                TE.map(() => callback(null, true)),
                TE.mapLeft(() => callback(null, false))
              )();
            },
            async (err, result) => {
              if (err instanceof Error) {
                return resolve(
                  TE.left(asW(['halt', err.message], env))
                );
              }

              if (result === undefined) {
                return resolve(
                  TE.left(asW(['halt', 'no match found in firstOf'], env))
                );
              }
              resolve(result);
            }
          );

        });
        maybeFirstRight.then(firstRight => )

        return eventualToResult(maybeFirstRight, env);
      })
    );
  };

export const fanin: <A, B> (arrow: ExtractionArrow<A[], B>) => ExtractionArrow<A[], B> =
  <A, B>(arrow: ExtractionArrow<A[], B>) => (ra: ExtractionResult<A[]>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[]>) => {
        return arrow(TE.right(wa));
      })
    );
  };

export function filterOn<A>(predicate: ClientFunc<A, boolean>): FilterFunction<A> {
  return (a: A, env: ExtractionEnv) => {
    return () => Promise.resolve(predicate(a, env))
      .then(b0 => b0
        ? E.right<WCI, W<A>>(asW(a, env))
        : E.left<WCI, W<A>>(asW('halt', env))
      )
  };
}


export function withEnv<A>(f: (env: ExtractionEnv) => ExtractionResultEA<A>): EnvFunction<A> {
  const f0: ExtractionFunction<void, A> =
    (_, env) => pipe(
      f(env),
      TE.map(a => asW(a, env)),
      TE.mapLeft(e => asW(e, env)),
    );

  return f0;
}

export function through<A, B>(f: ClientFunc<A, B>): ExtractionArrow<A, B> {
  return (ra: ExtractionResult<A>) => pipe(
    ra,
    TE.chain(([a, env]) => eventualToResult(f(a, env), env))
  );
}

export function tap<A>(f: ClientFunc<A, any>): ExtractionArrow<A, A> {
  return (ra: ExtractionResult<A>) => pipe(
    ra,
    through(f),
    TE.chain(() => ra)
  );
}

export function filter<A>(f: ClientFunc<A, boolean>): FilterArrow<A> {
  return bind_(filterOn(f))
}


// export function tap<A>(f: ClientFunc<A, any>): ExtractionArrow<A, A> {
//   return attempt(bind_(f));
// }
