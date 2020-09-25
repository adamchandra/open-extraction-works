import _ from 'lodash';

import { pipe, flow } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';

import Async from 'async';

export type ControlCode = 'halt' | 'continue';
export type ControlInstruction = ControlCode | [ControlCode, string];

export type W<A, Env> = [A, Env];
export function asW<A, Env>(a: A, w: Env): W<A, Env> {
  return [a, w];
}

export type WCI<Env> = W<ControlInstruction, Env>;

export type Eventual<A> = A | Promise<A>;
export type ClientFunc<A, B, Env> = (a: A, env: Env) => Eventual<B>;
export type ClientResultEither<A> = Eventual<E.Either<ControlInstruction, A>>;
export type ClientFuncEither<A, B, Env> = (a: A, env: Env) => ClientResultEither<B>;

export function eventualToResult<A, Env>(a: Eventual<A>, env: Env): ExtractionResult<A, Env> {
  return () => Promise.resolve(a)
    .then(a0 => E.right(asW(a0, env)));
}

export type ExtractionResultEA<A> = TE.TaskEither<ControlInstruction, A>;

export type ExtractionResult<A, Env> = TE.TaskEither<WCI<Env>, W<A, Env>>;
const ExtractionResult = {
  lift: <A, Env>(a: A, env: Env): ExtractionResult<A, Env> => TE.right(asW(a, env)),
  liftW: <A, Env>(wa: W<A, Env>): ExtractionResult<A, Env> => TE.right(wa),
  liftFail: <A, Env>(ci: ControlInstruction, env: Env): ExtractionResult<A, Env> => TE.left(asW(ci, env)),
};

export interface ExtractionArrow<A, B, Env> {
  (ra: ExtractionResult<A, Env>): ExtractionResult<B, Env>;
  name?: string;
}

export const ExtractionArrows = {
  lift: <A, B, Env>(fab: (a: A) => B): ExtractionArrow<A, B, Env> =>
    (er: ExtractionResult<A, Env>) => pipe(er, TE.fold(
      ([, env]) => ExtractionResult.liftFail('halt', env),
      ([s, env]) => ExtractionResult.lift(fab(s), env),
    )),

  liftClientEither: <A, B, Env>(fn: ClientFuncEither<A, B, Env>): ExtractionArrow<A, B, Env> =>
    (er: ExtractionResult<A, Env>) => pipe(er, TE.fold(
      ([, env]) => ExtractionResult.liftFail('halt', env),
      ([s, env]) => {
        const res: ClientResultEither<B> = Promise.resolve(fn(s, env));
        const asTask = () => res;
        const we = pipe(
          asTask,
          TE.mapLeft(qwer => asW(qwer, env)),
          TE.chain(b => ExtractionResult.lift(b, env))
        );
        return we;
      }
    ))
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

// bind f(a: A) => B
export const bindFA: <A, B, Env> (
  fab: ClientFunc<A, B, Env>
) => ExtractionArrow<A, B, Env> =
  (fab) => bind((a, env) => {
    return eventualToResult(fab(a, env), env);
  });

// bind f(a: A) => TaskEither<void, B>
export const bindFEither: <A, B, Env> (fab: ClientFuncEither<A, B, Env>) =>
  ExtractionArrow<A, B, Env> = (fab) => ExtractionArrows.liftClientEither(fab);


export const namedArrow: <A, B, Env> (
  name: string,
  arrow: ExtractionArrow<A, B, Env>
) => ExtractionArrow<A, B, Env> =
  (name, arrow) => {
    arrow.name = name;
    return arrow;
  }


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
            // const recs = _.flatMap(rights, ([, env]) => env.extractionRecords);
            const env0 = _.clone(env);
            // env0.extractionRecords.push(...recs);
            return asW(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);
      })
    );
  };

export const fanout: <A, B, Env> (arrow: ExtractionArrow<A, B, Env>) => FanoutArrow<A, B, Env> =
  <A, B, Env>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A[], Env>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[], Env>) => {
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
            const env0 = _.clone(env);
            return asW(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);
      })
    );
  };

export const attempt: <A, B, Env> (
  arrow: ExtractionArrow<A, B, Env>
) => ExtractionArrow<A, A, Env> =
  <A, B, Env>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A, Env>) => {
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
export const attemptAll: <A, B, Env> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B[], Env> =
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

export const firstOf: typeof flow = flow;

// Try each arrow on input until one succeeds
export const attemptSeries: <A, B, Env> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B, Env> =
  <A, B, Env>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
    // Base Case:
    if (arrows.length === 0) return pipe(
      ra,
      TE.chain(([, env]) => {
        return TE.left<WCI<Env>, W<B, Env>>(asW('continue', env));
      })
    );

    // Recursive Step:
    const headArrow: ExtractionArrow<A, B, Env> = arrows[0];
    const tailAarrows: ExtractionArrow<A, B, Env> = attemptSeries(...arrows.slice(1));
    return pipe(
      ra,
      headArrow, // if this returns left(..), try the next arrow
      TE.alt(() => pipe(ra, tailAarrows))
    );
  };

export const fanin: <A, B, Env> (arrow: ExtractionArrow<A[], B, Env>) => ExtractionArrow<A[], B, Env> =
  <A, B, Env>(arrow: ExtractionArrow<A[], B, Env>) => (ra: ExtractionResult<A[], Env>) => {
    return pipe(
      ra,
      TE.chain((wa: W<A[], Env>) => {
        return arrow(TE.right(wa));
      })
    );
  };

export function filterOn<A, Env>(predicate: ClientFunc<A, boolean, Env>): FilterFunction<A, Env> {
  return (a: A, env: Env) => {
    return () => Promise.resolve(predicate(a, env))
      .then(b0 => b0
        ? E.right<WCI<Env>, W<A, Env>>(asW(a, env))
        : E.left<WCI<Env>, W<A, Env>>(asW('halt', env))
      )
  };
}


export function through<A, B, Env>(f: ClientFunc<A, B, Env>): ExtractionArrow<A, B, Env> {
  return (ra: ExtractionResult<A, Env>) => pipe(
    ra,
    TE.chain(([a, env]) => eventualToResult(f(a, env), env))
  );
}

export function tap<A, Env>(f: ClientFunc<A, any, Env>): ExtractionArrow<A, A, Env> {
  return (ra: ExtractionResult<A, Env>) => pipe(
    ra,
    through(f),
    TE.chain(() => ra)
  );
}

export function filter<A, Env>(f: ClientFunc<A, boolean, Env>): FilterArrow<A, Env> {
  return bind_(filterOn(f))
}
