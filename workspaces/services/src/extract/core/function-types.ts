import _ from 'lodash';

import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';
import { Logger } from 'winston';

import Async from 'async';

export function isEither<A, B>(a: any): a is E.Either<A, B> {
  return isELeft(a) || isERight(a);
}
export function isELeft<A>(a: any): a is E.Left<A> {
  const isObj = _.isObject(a);
  return isObj && '_tag' in a && a._tag === 'Left' && 'left' in a;
}
export function isERight<A>(a: any): a is E.Right<A> {
  const isObj = _.isObject(a);
  return isObj && '_tag' in a && a._tag === 'Right' && 'right' in a;
}

/**
 * Instructions returned on the the Left to signal control flow
 * e.g., hard stop on error, continue after failure
 */
export type ControlCode = 'halt' | 'continue';
export type ControlInstruction = ControlCode | [ControlCode, string];

export interface BaseEnv {
  ns: string[];
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
  log: Logger;
}

export const nsPrefix = <Env extends BaseEnv>(e: Env) => _.join(e.ns, '/');

/**
 * Return value with user defined Environment
 */
export type W<A, Env extends BaseEnv> = [A, Env];
export function asW<A, Env extends BaseEnv>(a: A, w: Env): W<A, Env> {
  return [a, w];
}

export type WCI<Env extends BaseEnv> = W<ControlInstruction, Env>;

/**
 * Type signatures for client functions and return types
 */

export type Eventual<A> = A | Promise<A>;

export type EitherControlOrA<A> = E.Either<ControlInstruction, A>;

export type PostHook<A, B, Env extends BaseEnv> = (a: A, eb: EitherControlOrA<B>, env: Env) => void;

export type ClientResult<A> = Eventual<A>
  | Eventual<E.Either<ControlInstruction, A>>
  | TE.TaskEither<ControlInstruction, A>
  ;

export type ClientFunc<A, B, Env extends BaseEnv> = (a: A, env: Env) => ClientResult<B>;

export const ClientFunc = {
  success: <A>(a: A): E.Either<ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['continue', msg]),
}


//////////////
/// Lifted function types

export type EventualResult<A, Env extends BaseEnv> = Promise<E.Either<WCI<Env>, W<A, Env>>>;
export const EventualResult = {
  lift: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),

  liftW: <A, Env extends BaseEnv>(wa: Eventual<W<A, Env>>): EventualResult<A, Env> =>
    Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env extends BaseEnv>(ci: Eventual<ControlInstruction>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};


export type ExtractionResult<A, Env extends BaseEnv> = TE.TaskEither<WCI<Env>, W<A, Env>>;
export const ExtractionResult = {
  lift: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),


  liftW: <A, Env extends BaseEnv>(wa: Eventual<W<A, Env>>): ExtractionResult<A, Env> =>
    () => Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env extends BaseEnv>(ci: Eventual<ControlInstruction>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};

export interface ExtractionArrow<A, B, Env extends BaseEnv> {
  (ra: ExtractionResult<A, Env>): ExtractionResult<B, Env>;
}

export const ExtractionArrow = {
  lift: <A, B, Env extends BaseEnv>(
    fab: ClientFunc<A, B, Env>,
    postHook?: (a: A, eb: EitherControlOrA<B>, env: Env) => void,
  ): ExtractionArrow<A, B, Env> =>
    (er: ExtractionResult<A, Env>) => pipe(er, TE.fold(
      ([controlInstruction, env]) => {
        return ExtractionResult.liftFail(controlInstruction, env);
      },
      ([prev, env]) => {
        return () => Promise.resolve(fab(prev, env))
          .then(async (result) => {
            if (isELeft(result)) {
              const ci = result.left;
              if (postHook) {
                postHook(prev, result, env);
              }
              return EventualResult.liftFail<B, Env>(ci, env);
            }
            if (isERight(result)) {
              const b = result.right;
              if (postHook) {
                postHook(prev, result, env);
              }
              return EventualResult.lift<B, Env>(b, env);
            }
            if (_.isFunction(result)) {
              return result()
                .then(res => {
                  if (postHook) {
                    postHook(prev, res, env);
                  }
                  if (E.isLeft(res)) {
                    return EventualResult.liftFail<B, Env>(res.left, env);
                  }
                  return EventualResult.lift<B, Env>(res.right, env);
                });
            }

            if (postHook) {
              postHook(prev, E.right(result), env);
            }
            return EventualResult.lift(result, env);
          })
          .catch((err) => {
            return EventualResult.liftFail<B, Env>(['halt', err.toString()], env);
          });
      }
    )),
};


export type FilterArrow<A, Env extends BaseEnv> = ExtractionArrow<A, A, Env>;
export type ExtractionEither<A, Env extends BaseEnv> = E.Either<WCI<Env>, W<A, Env>>;

export type ExtractionFunction<A, B, Env extends BaseEnv> = (a: A, env: Env) => ExtractionResult<B, Env>;
export type FilterFunction<A, Env extends BaseEnv> = ExtractionFunction<A, A, Env>;
export type EnvFunction<B, Env extends BaseEnv> = ExtractionFunction<void, B, Env>;

export type FanoutArrow<A, B, Env extends BaseEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B[], Env>;
export type FaninArrow<A, B, Env extends BaseEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;

export const failure = <A>(msg: string = 'reason unspecified'): TE.TaskEither<ControlInstruction, A> => TE.left(['halt', msg]);
export const success = <A>(a: A): TE.TaskEither<ControlInstruction, A> => TE.right(a);
export const success_ = (): TE.TaskEither<ControlInstruction, void> => TE.right(undefined);

// export const bind: <A, B, Env extends BaseEnv> (
//   fab: ExtractionFunction<A, B, Env>
// ) => ExtractionArrow<A, B, Env> = (fab) => (ma) => pipe(
//   ma,
//   TE.map((wa) => {
//     // const [, env] = wa;
//     // const { log, logPrefix } = env;
//     // logPrefix.push(name);
//     // setLogLabel(log, _.join(logPrefix, '/'))
//     // log.debug('_begin_');
//     return wa;
//   }),
//   TE.chain((wa) => {
//     const [a, env] = wa;
//     return fab(a, env);
//   }),
//   TE.mapLeft((wa) => {
//     // const [code, env] = wa;
//     // const { log, logPrefix } = env;

//     // log.info(`_end_left_:  ${code}`);

//     // switch (code) {
//     //   case undefined:
//     //     break;
//     //   case 'halt':
//     //     break;
//     //   case 'continue':
//     //     break;
//     //   default:
//     //     break;
//     // }
//     // logPrefix.pop();
//     // setLogLabel(log, _.join(logPrefix, '/'))
//     return wa;
//   }),
// );


export const pushNS: <A, Env extends BaseEnv>(n: string) => ExtractionArrow<A, A, Env> =
  <A, Env extends BaseEnv>(name: string) => (ra: ExtractionResult<A, Env>) => {
    return pipe(
      ra,
      TE.map(([a, env]) => {
        env.ns.push(name);
        // putStrLn(`pushNS(right): ${_.join(env.ns, '/')}`)
        env.enterNS(env.ns);
        return asW(a, env);
      }),
      TE.mapLeft(([a, env]) => {
        env.ns.push(name);
        // putStrLn(`pushNS(left): ${_.join(env.ns, '/')}`)
        env.enterNS(env.ns);
        return asW(a, env);
      })
    );
  };

export const popNS: <A, Env extends BaseEnv>() => ExtractionArrow<A, A, Env> =
  <A, Env extends BaseEnv>() => (ra: ExtractionResult<A, Env>) => {
    return pipe(
      ra,
      TE.map(([a, env]) => {
        // putStrLn(`popNS(right): ${_.join(env.ns, '/')}`)
        env.ns.pop();
        env.exitNS(env.ns);
        return asW(a, env);
      }),
      TE.mapLeft(([a, env]) => {
        // putStrLn(`popNS(left): ${_.join(env.ns, '/')}`)
        env.ns.pop();
        env.exitNS(env.ns);
        return asW(a, env);
      }),
    );
  };

export const named: <A, B, Env extends BaseEnv> (name: string, arrow: ExtractionArrow<A, B, Env>) => ExtractionArrow<A, B, Env> =
  (name, arrow) => (ra) => pipe(
    ra,
    pushNS(`@${name}`),
    arrow,
    popNS(),
  );

export function separateResults<A, Env extends BaseEnv>(
  extractionResults: ExtractionResult<A, Env>[]
): Task.Task<[Array<W<ControlInstruction, Env>>, Array<W<A, Env>>]> {
  return () => Async.mapSeries<ExtractionResult<A, Env>, ExtractionEither<A, Env>>(
    extractionResults,
    async er => er())
    .then((settled: ExtractionEither<A, Env>[]) => {
      const lefts: WCI<Env>[] = [];
      const rights: W<A, Env>[] = [];
      _.each(settled, result => {
        if (isLeft(result)) lefts.push(result.left)
        else rights.push(result.right);
      });
      return [lefts, rights];
    });
}


// Control flow primitives

/// given as: A[]
/// given arrow: A => B
//  each(as, a => arrow(a)), then filter(isRight)
export const forEachDo: <A, B, Env extends BaseEnv> (arrow: ExtractionArrow<A, B, Env>) => FanoutArrow<A, B, Env> =
  <A, B, Env extends BaseEnv>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A[], Env>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[], Env>) => {
        const [aas, env] = wa;
        const bbs = _.map(aas, (a) => {
          const env0 = _.clone(env);
          return arrow(TE.right(asW<A, Env>(a, env0)));
        });
        const leftRightErrs = separateResults(bbs);
        const rightTasks = pipe(
          leftRightErrs,
          Task.map(([_lefts, rights]) => {
            const bs = _.map(rights, ([b]) => b);
            const env0 = _.clone(env);
            return asW(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);
      })
    );
  };


// Given a single input A, produce an array of Bs by running the given array of functions on the initial A
export const applyAll: <A, B, Env extends BaseEnv> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B[], Env> =
  <A, B, Env extends BaseEnv>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
    return pipe(
      ra,
      TE.chain(([a, env]: W<A, Env>) => {
        const bbs = _.map(arrows, (arrow) => {
          const env0 = _.clone(env);
          return arrow(TE.right(asW(a, env0)));
        });
        const leftRightErrs = separateResults(bbs);
        const rightTasks = pipe(
          leftRightErrs,
          Task.map(([_lefts, rights]) => {
            const bs = _.map(rights, ([b]) => b);
            const env0 = _.clone(env);
            return asW(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);

      })
    );
  };

// Try each arrow on input until one succeeds
export const attemptSeries: <A, B, Env extends BaseEnv> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B, Env> =
  <A, B, Env extends BaseEnv>(...arrows: ExtractionArrow<A, B, Env>[]) =>
    (ra: ExtractionResult<A, Env>) => pipe(
      ra,
      pushNS(`attemptSeries:${arrows.length}`),
      __attemptSeries(arrows, 0, arrows.length),
      popNS(),
    );



export const __attemptSeries: <A, B, Env extends BaseEnv> (arrows: ExtractionArrow<A, B, Env>[], attemptNum: number, attemptCount: number) => ExtractionArrow<A, B, Env> =
  <A, B, Env extends BaseEnv>(arrows: ExtractionArrow<A, B, Env>[], attemptNum: number, attemptCount: number) => (ra: ExtractionResult<A, Env>) => {
    // Base Case:
    if (arrows.length === 0) return pipe(
      ra,
      TE.chain(([, env]) => {
        return TE.left<WCI<Env>, W<B, Env>>(asW('continue', env));
      })
    );

    // Recursive Step:
    const headArrow: ExtractionArrow<A, B, Env> = arrows[0];
    const tailArrows: ExtractionArrow<A, B, Env>[] = arrows.slice(1);

    let origWA: W<A, Env>;
    return pipe(
      ra,
      pushNS(`${attemptNum}`),
      TE.map((wa) => {
        // store starting wa value, restore after calling f
        origWA = wa;
        return wa;
      }),
      headArrow,
      popNS(),
      TE.alt(() => {
        const ts: ExtractionArrow<A, B, Env> = __attemptSeries(tailArrows, attemptNum + 1, attemptCount);
        return pipe(
          TE.right(origWA),
          ts
        );
      }),
    );
  };


export function through<A, B, Env extends BaseEnv>(
  f: ClientFunc<A, B, Env>,
  name?: string,
  postHook?: PostHook<A, B, Env>,
): ExtractionArrow<A, B, Env> {
  const ns = name ? `through:${name}` : 'through';
  return (ra) => pipe(
    ra,
    pushNS(ns),
    ExtractionArrow.lift(f, postHook),
    popNS(),
  );
}

export function tap<A, Env extends BaseEnv>(f: ClientFunc<A, any, Env>, name?: string): ExtractionArrow<A, A, Env> {
  const fa: ExtractionArrow<A, A, Env> = (ra: ExtractionResult<A, Env>) => {
    let origWA: W<A, Env>;
    const ns = name ? `tap:${name}` : 'tap';

    return pipe(
      ra,
      pushNS(ns),
      TE.map((wa) => {
        // store starting wa value, restore after calling f
        origWA = wa;
        return wa;
      }),
      ExtractionArrow.lift(f),
      popNS(),
      TE.map(() => origWA),
    );
  };

  return fa;
}

const hook: <A, B, Env extends BaseEnv>(f: (a: A, b: EitherControlOrA<B>, env: Env) => void) =>
  PostHook<A, B, Env> = (f) => f;

export function filter<A, Env extends BaseEnv>(
  f: ClientFunc<A, boolean, Env>,
  name?: string,
  postHook?: PostHook<A, boolean, Env>,
): FilterArrow<A, Env> {
  const fa: FilterArrow<A, Env> = (ra: ExtractionResult<A, Env>) => {
    let origWA: W<A, Env>;
    const ns = name ? `if:${name}` : 'if:_';

    const filterHook = <A>() => hook<A, A, Env>((a, b, env) => {
      const msg = pipe(b, E.fold(
        (ci) => `fail(${ci}): ${a} `,
        (b0) => `${b0 ? 'pass' : 'fail'}: ${a}`
      ));
      env.log.info(`[${nsPrefix(env)}]> ${msg}`);
    });
    const fhook = postHook || name? filterHook() : undefined;

    return pipe(
      ra,
      pushNS(ns),
      TE.map((wa) => {
        // store starting wa value, restore after calling f
        origWA = wa;
        return wa;
      }),
      ExtractionArrow.lift(f, fhook),
      TE.chain(([fres, env]) => {
        return fres
          ? TE.right(origWA)
          : TE.left<WCI<Env>, W<A, Env>>(asW('halt', env))
      }),
      popNS(),
    );
  }

  return fa;
}

export const logInfo = <A, Env extends BaseEnv>(f: (a: A, env: Env) => string) =>
  tap((a: A, env: Env) => env.log.info(`[${nsPrefix(env)}]> ${f(a, env)}`));

export const logDebug = <A, Env extends BaseEnv>(f: (a: A, env: Env) => string) =>
  tap((a: A, env: Env) => env.log.debug(`[${nsPrefix(env)}]> ${f(a, env)}`));

export const logError = <A, Env extends BaseEnv>(f: (a: A, env: Env) => string) =>
  tap((a: A, env: Env) => env.log.error(`[${nsPrefix(env)}]> ${f(a, env)}`));
