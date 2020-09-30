import _ from 'lodash';

import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';

import Async from 'async';
import { putStrLn, prettyPrint } from 'commons/dist';

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

/**
 * Return value with user defined Environment
 */
export type W<A, Env> = [A, Env];
export function asW<A, Env>(a: A, w: Env): W<A, Env> {
  return [a, w];
}

export type WCI<Env> = W<ControlInstruction, Env>;

/**
 * Type signatures for client functions and return types
 */

export type Eventual<A> = A | Promise<A>;

export type ClientResult<A> = Eventual<A>
  | Eventual<E.Either<ControlInstruction, A>>
  | TE.TaskEither<ControlInstruction, A>
  ;

export type ClientFunc<A, B, Env> = (a: A, env: Env) => ClientResult<B>;

export const ClientFunc = {
  success: <A>(a: A): E.Either<ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['continue', msg]),
}


//////////////
/// Lifted function types

export type EventualResult<A, Env> = Promise<E.Either<WCI<Env>, W<A, Env>>>;
export const EventualResult = {
  lift: <A, Env>(a: Eventual<A>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),

  liftW: <A, Env>(wa: Eventual<W<A, Env>>): EventualResult<A, Env> =>
    Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env>(ci: Eventual<ControlInstruction>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};


export type ExtractionResult<A, Env> = TE.TaskEither<WCI<Env>, W<A, Env>>;
export const ExtractionResult = {
  lift: <A, Env>(a: Eventual<A>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<A>(a).then(a0 => E.right(asW(a0, env))),


  liftW: <A, Env>(wa: Eventual<W<A, Env>>): ExtractionResult<A, Env> =>
    () => Promise.resolve<W<A, Env>>(wa).then(wa0 => E.right(wa0)),

  liftFail: <A, Env>(ci: Eventual<ControlInstruction>, env: Env): ExtractionResult<A, Env> =>
    () => Promise.resolve<ControlInstruction>(ci).then(ci0 => E.left(asW(ci0, env))),
};

export interface ExtractionArrow<A, B, Env> {
  (ra: ExtractionResult<A, Env>): ExtractionResult<B, Env>;
}

export const ExtractionArrow = {
  lift: <A, B, Env>(fab: ClientFunc<A, B, Env>): ExtractionArrow<A, B, Env> =>
    (er: ExtractionResult<A, Env>) => pipe(er, TE.fold(
      ([controlInstruction, env]) => {
        // putStrLn('ExtractionArrow.lift(): left(ci)')
        prettyPrint({ msg: 'ExtractionArrow.lift(): left', controlInstruction })
        return ExtractionResult.liftFail(controlInstruction, env);
      },
      ([prev, env]) => {
        return () => Promise.resolve(fab(prev, env))
          .then(async (result) => {
            // putStrLn(`ExtractionArrow.lift(): right -> fab(${prev})`)
            prettyPrint({ msg: 'ExtractionArrow.lift(): right', prev })
            if (isELeft(result)) {
              // putStrLn(`ExtractionArrow.lift(): isELeft`)
              const ci = result.left;
              return EventualResult.liftFail<B, Env>(ci, env);
            }
            if (isERight(result)) {
              // putStrLn(`ExtractionArrow.lift(): isERight`)
              const b = result.right;
              return EventualResult.lift<B, Env>(b, env);
            }
            if (_.isFunction(result)) {
              // putStrLn(`ExtractionArrow.lift(): isFunction (Task)`)
              return result()
                .then(res => {
                  if (E.isLeft(res)) {
                    return EventualResult.liftFail<B, Env>(res.left, env);
                  }
                  return EventualResult.lift<B, Env>(res.right, env);
                });
            }
            // putStrLn(`ExtractionArrow.lift(): is B-val`)

            return EventualResult.lift(result, env);
          })
          .catch((err) => {
            return EventualResult.liftFail<B, Env>(['halt', err.toString()], env);
          });
      }
    )),
};


export type FilterArrow<A, Env> = ExtractionArrow<A, A, Env>;
export type ExtractionEither<A, Env> = E.Either<WCI<Env>, W<A, Env>>;

export type ExtractionFunction<A, B, Env> = (a: A, env: Env) => ExtractionResult<B, Env>;
export type FilterFunction<A, Env> = ExtractionFunction<A, A, Env>;
export type EnvFunction<B, Env> = ExtractionFunction<void, B, Env>;

export type FanoutArrow<A, B, Env> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B[], Env>;
export type FaninArrow<A, B, Env> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;

export const failure = <A>(msg: string = 'reason unspecified'): TE.TaskEither<ControlInstruction, A> => TE.left(['halt', msg]);
export const success = <A>(a: A): TE.TaskEither<ControlInstruction, A> => TE.right(a);
export const success_ = (): TE.TaskEither<ControlInstruction, void> => TE.right(undefined);

export const bind_: <A, B, Env> (
  f: ExtractionFunction<A, B, Env>
) => ExtractionArrow<A, B, Env> =
  (f) => (ma) => {
    return pipe(
      ma,
      TE.chain(([a, env]) => f(a, env)),
    );
  };

export const bind: <A, B, Env> (
  fab: ExtractionFunction<A, B, Env>
) => ExtractionArrow<A, B, Env> = (fab) => (ma) => pipe(
  ma,
  TE.map((wa) => {
    // const [, env] = wa;
    // const { log, logPrefix } = env;
    // logPrefix.push(name);
    // setLogLabel(log, _.join(logPrefix, '/'))
    // log.debug('_begin_');
    return wa;
  }),
  TE.chain((wa) => {
    const [a, env] = wa;
    return fab(a, env);
  }),
  TE.mapLeft((wa) => {
    // const [code, env] = wa;
    // const { log, logPrefix } = env;

    // log.info(`_end_left_:  ${code}`);

    // switch (code) {
    //   case undefined:
    //     break;
    //   case 'halt':
    //     break;
    //   case 'continue':
    //     break;
    //   default:
    //     break;
    // }
    // logPrefix.pop();
    // setLogLabel(log, _.join(logPrefix, '/'))
    return wa;
  }),
);

// export const namedArrow: <A, B, Env> (
//   name: string,
//   arrow: ExtractionArrow<A, B, Env>
// ) => ExtractionArrow<A, B, Env> =
//   (name, arrow) => {
//     return arrow;
//   }


export function separateResults<A, Env>(
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
export const forEachDo: <A, B, Env> (arrow: ExtractionArrow<A, B, Env>) => FanoutArrow<A, B, Env> =
  <A, B, Env>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A[], Env>) => {
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
export const applyAll: <A, B, Env> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B[], Env> =
  <A, B, Env>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
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
export const attemptSeries: <A, B, Env> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B, Env> =
  <A, B, Env>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
    // Base Case:
    // putStrLn(`attemptSeries( arrows.length: ${arrows.length} )`);
    if (arrows.length === 0) return pipe(
      ra,
      TE.chain(([, env]) => {
        return TE.left<WCI<Env>, W<B, Env>>(asW('continue', env));
      })
    );

    // Recursive Step:
    // putStrLn(`attemptSeries(): gen-case`);
    const headArrow: ExtractionArrow<A, B, Env> = arrows[0];
    const tailArrows: ExtractionArrow<A, B, Env>[] = arrows.slice(1);
    return pipe(
      ra,
      headArrow,
      TE.alt(() => {
        // putStrLn(`attemptSeries(): alt-case`);
        const ts: ExtractionArrow<A, B, Env> = attemptSeries(...tailArrows);
        return pipe(ra, ts);
      })
    )
  };


export function through<A, B, Env>(f: ClientFunc<A, B, Env>): ExtractionArrow<A, B, Env> {
  return ExtractionArrow.lift(f);
}

export function tap<A, Env>(f: ClientFunc<A, any, Env>): ExtractionArrow<A, A, Env> {
  const fa: ExtractionArrow<A, A, Env> = (ra: ExtractionResult<A, Env>) => {
    let origWA: W<A, Env>;

    return pipe(
      ra,
      TE.map((wa) => {
        // store starting wa value, restore after calling f
        origWA = wa;
        return wa;
      }),
      through(f),
      TE.map(() => origWA),
    );
  };

  return fa;
}

export function filter<A, Env>(f: ClientFunc<A, boolean, Env>): FilterArrow<A, Env> {
  const fa: FilterArrow<A, Env> = (ra: ExtractionResult<A, Env>) => {
    let origWA: W<A, Env>;
    return pipe(
      ra,
      TE.map((wa) => {
        // store starting wa value, restore after calling f
        origWA = wa;
        putStrLn(`filter:begin(${wa[0]})`)
        return wa;
      }),
      through(f),
      TE.chain(([fres, env]) => {
        putStrLn(`filter:end() => ${fres}`)
        return fres
          ? TE.right(origWA)
          : TE.left<WCI<Env>, W<A, Env>>(asW('halt', env))
      })
    );
  }

  return fa;
}


// export const attempt: <A, B, Env> (
//   arrow: ExtractionArrow<A, B, Env>
// ) => ExtractionArrow<A, A, Env> =
//   <A, B, Env>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A, Env>) => {
//     return pipe(
//       ra,
//       arrow,
//       TE.fold(
//         () => ra,
//         () => ra,
//       ),
//     );
//   };

// export const fanin: <A, B, Env> (arrow: ExtractionArrow<A[], B, Env>) => ExtractionArrow<A[], B, Env> =
//   <A, B, Env>(arrow: ExtractionArrow<A[], B, Env>) => (ra: ExtractionResult<A[], Env>) => {
//     return pipe(
//       ra,
//       TE.chain((wa: W<A[], Env>) => {
//         return arrow(TE.right(wa));
//       })
//     );
//   };
