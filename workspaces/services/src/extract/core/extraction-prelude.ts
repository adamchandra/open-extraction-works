import _ from 'lodash';

import { pipe, flow } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
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

export type W<A, Env = ExtractionEnv> = [A, Env];
export function asW<A, Env = ExtractionEnv>(a: A, w: Env): W<A, Env> {
  return [a, w];
}

export type WCI<Env = ExtractionEnv> = W<ControlInstruction, Env>;

export type Eventual<A> = A | Promise<A>;
export type ClientFunc<A, B, Env=ExtractionEnv> = (a: A, env: Env) => Eventual<B>;
export type ClientResultEither<A> = Eventual<E.Either<ControlInstruction, A>>;
export type ClientFuncEither<A, B, Env=ExtractionEnv> = (a: A, env: Env) => ClientResultEither<B>;

export function eventualToResult<A>(a: Eventual<A>, env: ExtractionEnv): ExtractionResult<A> {
  return () => Promise.resolve(a)
    .then(a0 => E.right(asW(a0, env)));
}

export type ExtractionResultEA<A> = TE.TaskEither<ControlInstruction, A>;
export type ExtractionResult<A, Env = ExtractionEnv> = TE.TaskEither<WCI<Env>, W<A, Env>>;

// TODO rename this (arrow to ???):
export type ExtractionArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A, Env>) => ExtractionResult<B, Env>;
export type FilterArrow<A, Env = ExtractionEnv> = ExtractionArrow<A, A, Env>;
export type ExtractionEither<A, Env = ExtractionEnv> = E.Either<WCI<Env>, W<A, Env>>;

export type ExtractionFunction<A, B, Env = ExtractionEnv> = (a: A, env: Env) => ExtractionResult<B, Env>;
export type FilterFunction<A, Env = ExtractionEnv> = ExtractionFunction<A, A, Env>;
export type EnvFunction<B, Env = ExtractionEnv> = ExtractionFunction<void, B, Env>;

export type FanoutArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B[], Env>;
export type FaninArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;

export const failure = <A>(msg: string = 'reason unspecified'): TE.TaskEither<ControlInstruction, A> => TE.left(['halt', msg]);

export const success = <A>(a: A): TE.TaskEither<ControlInstruction, A> => TE.right(a);
export const success_ = (): TE.TaskEither<ControlInstruction, void> => TE.right(undefined);

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


export const forEachDo: <A, B, Env = ExtractionEnv> (arrow: ExtractionArrow<A, B, Env>) => FanoutArrow<A, B, Env> =
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

export const firstOf: typeof flow = flow;

// Try each arrow on input until one succeeds
export const attemptSeries: <A, B, Env = ExtractionEnv> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B, Env> =
  <A, B, Env = ExtractionEnv>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
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
