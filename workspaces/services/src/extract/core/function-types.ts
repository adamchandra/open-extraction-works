import _ from 'lodash';

import { pipe, flow as compose } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';
import { Logger } from 'winston';

import Async from 'async';
// import { putStrLn } from 'commons';

export interface FPackage<Env extends BaseEnv> {
  nsPrefix(e: Env): string;
  asW<A>(a: A, w: Env): W<A, Env>;

  withNS: <A, B>(name: string, arrow: Arrow<A, B, Env>) => Arrow<A, B, Env>;
  // carryWA: <A, B>(arrow: Arrow<A, B, Env>) => Arrow<A, [B, W<A, Env>], Env>;
  withCarriedWA: <A, Env extends BaseEnv>(arrow: Arrow<A, unknown, Env>) => Arrow<A, A, Env>;
  forEachDo: <A, B> (arrow: Arrow<A, B, Env>) => FanoutArrow<A, B, Env>;
  applyAll: <A, B> (...arrows: Arrow<A, B, Env>[]) => Arrow<A, B[], Env>;
  scatterAndSettle: <A, B> (...arrows: Arrow<A, B, Env>[]) => Arrow<A, PerhapsW<B, Env>[], Env>;
  attemptSeries: <A, B> (...arrows: Arrow<A, B, Env>[]) => Arrow<A, B, Env>;
  composeSeries: <A, Env extends BaseEnv> (...arrows: Arrow<A, A, Env>[]) => Arrow<A, A, Env>;
  through<A, B>(f: ClientFunc<A, B, Env>, name?: string, postHook?: PostHook<A, B, Env>,): Arrow<A, B, Env>;
  throughLeft<A>(f: ControlFunc<Env>): Arrow<A, A, Env>;
  tapLeft<A>(f: ControlFunc<Env>,): Arrow<A, A, Env>
  tap<A>(f: ClientFunc<A, unknown, Env>, name?: string): Arrow<A, A, Env>;
  liftFilter<A>(f: ClientFunc<A, boolean, Env>, name?: string, postHook?: PostHook<A, boolean, Env>,): Arrow<A, boolean, Env>;
  filter<A>(f: ClientFunc<A, boolean, Env>, name?: string, postHook?: PostHook<A, boolean, Env>,): FilterArrow<A, Env>;
  ifThen<A, B>(cond: Arrow<A, boolean, Env>, onTrue: Arrow<A, B, Env>): Arrow<A, B, Env>;
  log: <A>(level: LogLevel, f: (a: A, env: Env) => string) => Arrow<A, A, Env>;

  Arrow: {
    lift: <A, B>(
      fab: ClientFunc<A, B, Env>,
      postHook?: (a: A, eb: EitherControlOrA<B>, env: Env) => void,
    ) => Arrow<A, B, Env>;
  };


  ExtractionResult: {
    lift: <A>(a: Eventual<A>, env: Env) => ExtractionResult<A, Env>;
    liftW: <A>(wa: Eventual<W<A, Env>>) => ExtractionResult<A, Env>;
    liftFail: <A>(ci: Eventual<ControlInstruction>, env: Env) => ExtractionResult<A, Env>;
  };

  ClientFunc: {
    success: <A>(a: A) => E.Either<ControlInstruction, A>;
    halt: <A>(msg: string) => E.Either<ControlInstruction, A>;
    continue: <A>(msg: string) => E.Either<ControlInstruction, A>;
  }
}

export function createFPackage<Env extends BaseEnv>(): FPackage<Env> {
  const fp: FPackage<Env> = {
    nsPrefix,
    asW,
    withNS,
    // carryWA,
    withCarriedWA,
    forEachDo,
    applyAll,
    scatterAndSettle,
    attemptSeries,
    composeSeries,
    through,
    throughLeft,
    tapLeft,
    tap,
    liftFilter,
    filter,
    ifThen,
    log,
    Arrow,
    ExtractionResult,
    ClientFunc,
  }
  return fp;
}

// function isEither<A, B>(a: any): a is E.Either<A, B> {
//   return isELeft(a) || isERight(a);
// }
function isELeft<A>(a: any): a is E.Left<A> {
  const isObj = _.isObject(a);
  return isObj && '_tag' in a && a._tag === 'Left' && 'left' in a;
}
function isERight<A>(a: any): a is E.Right<A> {
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

const nsPrefix = <Env extends BaseEnv>(e: Env) => _.join(e.ns, '/');

/**
 * Return value with user defined Environment
 */
export type W<A, Env extends BaseEnv> = [A, Env];
function asW<A, Env extends BaseEnv>(a: A, w: Env): W<A, Env> {
  return [a, w];
}

export type WCI<Env extends BaseEnv> = W<ControlInstruction, Env>;
function asWCI<Env extends BaseEnv>(ci: ControlInstruction, w: Env): WCI<Env> {
  return [ci, w];
}

/**
 * Type signatures for client functions and return types
 */

export type Eventual<A> = A | Promise<A>;

export type EitherControlOrA<A> = E.Either<ControlInstruction, A>;

export type Perhaps<A> = E.Either<ControlInstruction, A>;
export type PerhapsW<A, Env extends BaseEnv> = E.Either<WCI<Env>, W<A, Env>>;

export type PostHook<A, B, Env extends BaseEnv> = (a: A, eb: EitherControlOrA<B>, env: Env) => void;

export type ClientResult<A> = Eventual<A>
  | Eventual<E.Either<ControlInstruction, A>>
  | TE.TaskEither<ControlInstruction, A>
  ;

export type ClientFunc<A, B, Env extends BaseEnv> = (a: A, env: Env) => ClientResult<B>;
export type ControlFunc<Env extends BaseEnv> =
  (ci: ControlInstruction, env: Env) => ControlInstruction | undefined | void;

const ClientFunc = {
  success: <A>(a: A): E.Either<ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['continue', msg]),
}


//////////////
/// Lifted function types

export type EventualResult<A, Env extends BaseEnv> = Promise<E.Either<WCI<Env>, W<A, Env>>>;
const EventualResult = {
  lift: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),

  liftW: <A, Env extends BaseEnv>(wa: Eventual<W<A, Env>>): EventualResult<A, Env> =>
    Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env extends BaseEnv>(ci: Eventual<ControlInstruction>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};


export type ExtractionResult<A, Env extends BaseEnv> = TE.TaskEither<WCI<Env>, W<A, Env>>;
const ExtractionResult = {
  lift: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),


  liftW: <A, Env extends BaseEnv>(wa: Eventual<W<A, Env>>): ExtractionResult<A, Env> =>
    () => Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env extends BaseEnv>(ci: Eventual<ControlInstruction>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};

export interface Arrow<A, B, Env extends BaseEnv> {
  (ra: ExtractionResult<A, Env>): ExtractionResult<B, Env>;
}

const Arrow = {
  lift: <A, B, Env extends BaseEnv>(
    fab: ClientFunc<A, B, Env>,
    postHook?: (a: A, eb: EitherControlOrA<B>, env: Env) => void,
  ): Arrow<A, B, Env> =>
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


export type FilterArrow<A, Env extends BaseEnv> = Arrow<A, A, Env>;
export type ExtractionEither<A, Env extends BaseEnv> = E.Either<WCI<Env>, W<A, Env>>;

export type ExtractionFunction<A, B, Env extends BaseEnv> = (a: A, env: Env) => ExtractionResult<B, Env>;
export type FilterFunction<A, Env extends BaseEnv> = ExtractionFunction<A, A, Env>;
export type EnvFunction<B, Env extends BaseEnv> = ExtractionFunction<void, B, Env>;

export type FanoutArrow<A, B, Env extends BaseEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B[], Env>;
export type FaninArrow<A, B, Env extends BaseEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;


const pushNS: <A, Env extends BaseEnv>(n: string) => Arrow<A, A, Env> =
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

const popNS: <A, Env extends BaseEnv>() => Arrow<A, A, Env> =
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

const withNS: <A, B, Env extends BaseEnv>(name: string, arrow: Arrow<A, B, Env>) => Arrow<A, B, Env> =
  <A, B, Env extends BaseEnv>(name: string, arrow: Arrow<A, B, Env>) =>
    (ra: ExtractionResult<A, Env>) => pipe(
      ra,
      pushNS(name),
      arrow,
      popNS()
    );

const carryWA: <A, B, Env extends BaseEnv>(arrow: Arrow<A, B, Env>) => Arrow<A, [B, W<A, Env>], Env> =
  <A, B, Env extends BaseEnv>(arrow: Arrow<A, B, Env>) => {
    let origWA: W<A, Env>;

    return (ra: ExtractionResult<A, Env>) => pipe(
      ra,
      TE.map((wa) => {
        origWA = wa;
        return wa;
      }),
      arrow,
      TE.chain(([b, env]) => {
        return TE.right(asW([b, origWA], env));
      }),
    );
  }


const withCarriedWA: <A, Env extends BaseEnv>(arrow: Arrow<A, unknown, Env>) => Arrow<A, A, Env> =
  (arrow) => compose(
    carryWA(arrow),
    TE.map(([[_b, wa], _envb]) => wa),
  );

function separateResults<A, Env extends BaseEnv>(
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
const forEachDo: <A, B, Env extends BaseEnv> (arrow: Arrow<A, B, Env>) => FanoutArrow<A, B, Env> =
  <A, B, Env extends BaseEnv>(arrow: Arrow<A, B, Env>) => (ra: ExtractionResult<A[], Env>) => {
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
const applyAll: <A, B, Env extends BaseEnv> (...arrows: Arrow<A, B, Env>[]) => Arrow<A, B[], Env> =
  <A, B, Env extends BaseEnv>(...arrows: Arrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
    return pipe(
      ra,
      scatterAndSettle(...arrows),
      TE.chain(([settledBs, env]) => {
        const bs: B[] = [];
        _.each(settledBs, (wb) => {
          if (E.isRight(wb)) {
            const [b] = wb.right;
            bs.push(b);
          } else {
            const [ci] = wb.left;
            let msg = '';
            if (typeof ci === 'string') {
              msg = ci;
            } else {
              const [code, m] = ci;
              msg = `${code}: ${m}`;
            }
            env.log.log('debug', `applyAll/left = ${msg}`);
          }
        });
        return TE.right(asW(bs, env));
      })
    );
  };


const scatterAndSettle: <A, B, Env extends BaseEnv> (
  ...arrows: Arrow<A, B, Env>[]
) => Arrow<A, PerhapsW<B, Env>[], Env> =
  <A, B, Env extends BaseEnv>(...arrows: Arrow<A, B, Env>[]) =>
    (ra: ExtractionResult<A, Env>) => pipe(
      ra,
      TE.chain(([a, env]: W<A, Env>) => {
        const bbs = _.map(arrows, (arrow) => {
          const env0 = _.clone(env);
          return arrow(TE.right(asW(a, env0)));
        });
        const sequenced = () => Async
          .mapSeries<ExtractionResult<B, Env>, PerhapsW<B, Env>>(
            bbs, async er => er()
          );
        const pBsTask = pipe(
          sequenced,
          Task.map((perhapsBs) => asW(perhapsBs, env))
        );
        return TE.fromTask(pBsTask);
      })
    );

// Compose arrows
// <A, B, Env extends BaseEnv>(...arrows: Arrow<A, B, Env>[]) => compose(
const composeSeries: <A, Env extends BaseEnv> (...arrows: Arrow<A, A, Env>[]) => Arrow<A, A, Env> =
  (...arrows) => withNS(
    `composeSeries:${arrows.length}`,
    __composeSeries(arrows, arrows.length)
  );

const __composeSeries: <A, Env extends BaseEnv> (arrows: Arrow<A, A, Env>[], arrowCount: number) => Arrow<A, A, Env> =
  <A, Env extends BaseEnv>(arrows: Arrow<A, A, Env>[], arrowCount: number) => (ra: ExtractionResult<A, Env>) => {
    // Base Case:
    if (arrows.length === 0) return ra;

    // Recursive Step:
    const headArrow: Arrow<A, A, Env> = arrows[0];
    const tailArrows: Arrow<A, A, Env>[] = arrows.slice(1);
    const arrowNum = arrowCount - arrows.length;
    const ns = `#${arrowNum}`;

    return pipe(
      ra,
      withCarriedWA(withNS(
        ns,
        headArrow
      )),
      __composeSeries(tailArrows, arrowCount)
    );
  };

// Try each arrow on input until one succeeds
const attemptSeries: <A, B, Env extends BaseEnv> (...arrows: Arrow<A, B, Env>[]) => Arrow<A, B, Env> =
  (...arrows) => withNS(
    `attemptSeries:${arrows.length}`,
    __attemptSeries(arrows, arrows.length),
  );


const __attemptSeries: <A, B, Env extends BaseEnv> (arrows: Arrow<A, B, Env>[], arrowCount: number) => Arrow<A, B, Env> =
  (arrows, arrowCount) => (ra) => {
    // Base Case:
    if (arrows.length === 0) return pipe(
      ra,
      TE.chain(([, env]) => {
        return TE.left(asWCI('continue', env));
      })
    );

    // Recursive Step:
    const headArrow = arrows[0];
    const tailArrows = arrows.slice(1);
    const arrowNum = arrowCount - arrows.length;
    const ns = `#${arrowNum}`;

    return pipe(
      ra,
      withNS(ns, headArrow),
      TE.alt(() => pipe(ra, __attemptSeries(tailArrows, arrowCount))),
    );
  };

const hook: <A, B, Env extends BaseEnv>(f: (a: A, b: EitherControlOrA<B>, env: Env) => void) =>
  PostHook<A, B, Env> = (f) => f;

function through<A, B, Env extends BaseEnv>(
  f: ClientFunc<A, B, Env>,
  name?: string,
  postHook?: PostHook<A, B, Env>,
): Arrow<A, B, Env> {
  const ns = name ? `fn:${name}` : 'fn()';

  const mhook = <A>() => hook<A, B, Env>((a, b, env) => {
    const msg = pipe(b, E.fold(
      (ci) => `control(${ci}): ${a} `,
      (b) => `${a} => ${b}`
    ));
    env.log.info(msg);
  });

  const fhook = postHook || name ? mhook() : undefined;
  return (ra) => pipe(
    ra,
    pushNS(ns),
    Arrow.lift(f, fhook),
    popNS(),
  );
}

function throughLeft<A, Env extends BaseEnv>(
  f: ControlFunc<Env>,
): Arrow<A, A, Env> {

  return (ra) => pipe(
    ra,
    TE.mapLeft(([ci, env]) => {
      const fres = f(ci, env);
      const ci0 = fres ? fres : ci;
      return asW(ci0, env)
    }),
  );
}

function tapLeft<A, Env extends BaseEnv>(
  f: ControlFunc<Env>,
): Arrow<A, A, Env> {
  return (ra) => pipe(
    ra,
    TE.mapLeft(([ci, env]) => {
      f(ci, env);
      return asW(ci, env)
    }),
  );
}

function tap<A, Env extends BaseEnv>(f: ClientFunc<A, unknown, Env>, name?: string): Arrow<A, A, Env> {
  const ns = name ? `tap:${name}` : 'tap';
  return withCarriedWA(
    withNS(ns, Arrow.lift(f))
  );
}

function liftFilter<A, Env extends BaseEnv>(
  f: ClientFunc<A, boolean, Env>,
  name?: string,
  postHook?: PostHook<A, boolean, Env>,
): Arrow<A, boolean, Env> {

  const filterHook = <A>() => hook<A, A, Env>((a, b, env) => {
    const msg = pipe(b, E.fold(
      (ci) => `( ${a} ) => fail(${ci})`,
      (b0) => `( ${a} ) => ${b0 ? 'pass' : 'fail'}`
    ));
    env.log.info(msg);
  });
  const fhook = postHook || name ? filterHook() : undefined;

  return Arrow.lift(f, fhook);
}

function filter<A, Env extends BaseEnv>(
  f: ClientFunc<A, boolean, Env>,
  name?: string,
  postHook?: PostHook<A, boolean, Env>,
): FilterArrow<A, Env> {
  const fa: FilterArrow<A, Env> = (ra: ExtractionResult<A, Env>) => {
    const ns = name ? `cond:${name}` : 'cond:_';

    return pipe(
      ra,
      carryWA(withNS(
        ns,
        liftFilter(f, name, postHook)
      )),
      TE.chain(([[cond, origWA], env]) => {
        return cond
          ? TE.right(origWA)
          : TE.left<WCI<Env>, W<A, Env>>(asW('halt', env))
      }),
    );
  }

  return fa;
}

function ifThen<A, B, Env extends BaseEnv>(
  cond: Arrow<A, boolean, Env>,
  onTrue: Arrow<A, B, Env>
): Arrow<A, B, Env> {
  return compose(
    carryWA(
      withNS('ifThen', cond),
    ),
    TE.chain(([[condResult, wa], env]) => {
      return condResult
        ? TE.right(wa)
        : TE.left<WCI<Env>, W<A, Env>>(asW('halt', env))
    }),
    onTrue
  );
}



export type LogLevel = 'info'
  | 'debug'
  | 'warn'
  | 'error'
  ;


const log = <A, Env extends BaseEnv>(level: LogLevel, f: (a: A, env: Env) => string) =>
  tap((a: A, env: Env) => env.log.log(level, `${f(a, env)}`));


// and/or

// const bind: <A, B, Env extends BaseEnv> (
//   fab: ExtractionFunction<A, B, Env>
// ) => Arrow<A, B, Env> = (fab) => (ma) => pipe(
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
