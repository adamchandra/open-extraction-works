import _ from 'lodash';

import { pipe  } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';

import Async from 'async';

import { Metadata } from '~/spidering/data-formats';
import { setLogLabel } from 'commons';
import { Logger } from 'winston';
import { ExtractionRecord } from './extraction-records';
import * as ft from './function-types';

export interface NormalForms {
  'css-norm': null;
  'original': null;
  'tidy-norm': null
}
export type NormalForm = keyof NormalForms;

export type ExtractionEnv = {
  log: Logger;
  logPrefix: string[];
  entryPath: string;
  metadata: Metadata;
  extractionRecords: ExtractionRecord[];
  fileContentCache: Record<string, string>;
};

type EnvT = ExtractionEnv;
const asW = <A>(a: A, env: EnvT) => ft.asW<A, EnvT>(a, env);

export type W<A> = ft.W<A, EnvT>;
export const W = {
  lift: <A>(a: A, env: EnvT) => asW(a, env),
};


export type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
type ClientResultEither<A> = ft.ClientResultEither<A>;
type ClientFuncEither<A, B> = ft.ClientFuncEither<A, B, EnvT>;
export const ClientFunc = {
  success: <A>(a: A): E.Either<ft.ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ft.ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ft.ControlInstruction, A> => E.left(['continue', msg]),
}

// export const failure = <A>(msg: string = 'reason unspecified'): TE.TaskEither<ControlInstruction, A> => TE.left(['halt', msg]);
// export const success = <A>(a: A): TE.TaskEither<ControlInstruction, A> => TE.right(a);
// export const success_ = (): TE.TaskEither<ControlInstruction, void> => TE.right(undefined);


export type WCI = ft.WCI<EnvT>
export type ExtractionResult<A> = ft.ExtractionResult<A, EnvT>;
export const ExtractionResult = {
  lift: <A>(a: A, env: EnvT): ExtractionResult<A> => TE.right(asW(a, env)),
  liftW: <A>(wa: W<A>): ExtractionResult<A> => TE.right(wa),
  liftFail: <A>(ci: ft.ControlInstruction, env: EnvT): ExtractionResult<A> => TE.left(asW(ci, env)),
};


export type ExtractionArrow<A, B> = ft.ExtractionArrow<A, B, EnvT>;

const lifted: <A, B>(fab: ClientFunc<A, B>) => ExtractionArrow<A, B> =
  (fab) => (er) => ft.ExtractionArrows.lift(fab)(er),



export const ExtractionArrow = {
  // lift: <A, B>(fab: (a: A, e: EnvT) => B): ExtractionArrow<A, B> =>
  //   (er: ExtractionResult<A>) => pipe(er, TE.fold(
  //     ([, env]) => ExtractionResult.liftFail('halt', env),
  //     ([s, env]) => ExtractionResult.lift(fab(s, env), env),
  //   )),
  // lift: <A, B>(fab: (a: A, e: EnvT) => B): ExtractionArrow<A, B> =>
  //   (er: ExtractionResult<A>) => ft.ExtractionArrows.lift<A, B, EnvT>,

    // ft.ExtractionArrows.lift<A, B, EnvT>,

  liftClientEither: <A, B>(fn: ClientFuncEither<A, B>): ExtractionArrow<A, B> =>
    (er: ExtractionResult<A>) => pipe(er, TE.fold(
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
    )),
  liftClientTaskEither: <A, B>(fn: ClientFuncEither<A, B>): ExtractionArrow<A, B> =>
    (er: ExtractionResult<A>) => pipe(er, TE.fold(
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
}

export type ExtractionFunction<A, B> = ft.ExtractionFunction<A, B, EnvT>;
export type FilterArrow<A> = ft.FilterArrow<A, EnvT>;
export type ExtractionEither<A> = ft.ExtractionEither<A, EnvT>;
export type FilterFunction<A> = ft.FilterFunction<A, EnvT>;
export type EnvFunction<A> = ft.EnvFunction<A, EnvT>;

// export type FanoutArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B[], Env>;
// export type FaninArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;



export const bind_: <A, B> (f: ExtractionFunction<A, B>) => ExtractionArrow<A, B> =
  (f) => ft.bind_(f);

export const bind: <A, B> (f: ExtractionFunction<A, B>) => ExtractionArrow<A, B> =
  (f) => ft.bind(f);


// export const bindArrow: <A, B> (
//   name: string,
//   arrow: ExtractionArrow<A, B>
// ) => ExtractionArrow<A, B> =
//   (name, arrow) => bind(name, (a, env) => {
//     return pipe(
//       TE.right(asW(a, env)),
//       arrow
//     );
//   });


// export function separateResults<A, Env>(
//   extractionResults: ExtractionResult<A, Env>[]
// ): Task.Task<[Array<W<ControlInstruction, Env>>, Array<W<A, Env>>]> {
//   return () => Async.mapSeries<ExtractionResult<A, Env>, ExtractionEither<A, Env>>(
//     extractionResults,
//     async er => er())
//     .then((settled: ExtractionEither<A, Env>[]) => {
//       const lefts: WCI<Env>[] = [];
//       const rights: W<A, Env>[] = [];
//       _.each(settled, result => {
//         if (isLeft(result)) lefts.push(result.left)
//         else rights.push(result.right);
//       });
//       return [lefts, rights];
//     });
// }


// // Control flow primitives


// export const forEachDo: <A, B, Env = ExtractionEnv> (arrow: ExtractionArrow<A, B, Env>) => FanoutArrow<A, B, Env> =
//   <A, B, Env>(arrow: ExtractionArrow<A, B, Env>) => (ra: ExtractionResult<A[], Env>) => {
//     return pipe(
//       ra,
//       TE.chain((wa: W<A[], Env>) => {
//         const [aas, env] = wa;
//         const bbs = _.map(aas, (a) => {
//           const env0 = _.clone(env);
//           return arrow(TE.right(asW<A, Env>(a, env0)));
//         });
//         const leftRightErrs = separateResults(bbs);
//         const rightTasks = pipe(
//           leftRightErrs,
//           Task.map(([_lefts, rights]) => {
//             const bs = _.map(rights, ([b]) => b);
//             // const recs = _.flatMap(rights, ([, env]) => env.extractionRecords);
//             const env0 = _.clone(env);
//             // env0.extractionRecords.push(...recs);
//             return asW(bs, env0);
//           })
//         );
//         return TE.fromTask(rightTasks);
//       })
//     );
//   };

// export const fanout: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
//   <A, B>(arrow: ExtractionArrow<A, B>) => (ra: ExtractionResult<A[]>) => {
//     return pipe(
//       ra,
//       TE.chain((wa: W<A[]>) => {
//         const [aas, env] = wa;
//         const bbs = _.map(aas, (a) => {
//           const env0 = _.clone(env);
//           return arrow(TE.right(asW(a, env0)));
//         });
//         const leftRightErrs = separateResults(bbs);
//         const rightTasks = pipe(
//           leftRightErrs,
//           Task.map(([_lefts, rights]) => {
//             const bs = _.map(rights, ([b]) => b);
//             const recs = _.flatMap(rights, ([, env]) => env.extractionRecords);
//             const env0 = _.clone(env);
//             env0.extractionRecords.push(...recs);
//             return asW(bs, env0);
//           })
//         );
//         return TE.fromTask(rightTasks);
//       })
//     );
//   };

// export const attempt: <A, B> (
//   arrow: ExtractionArrow<A, B>
// ) => ExtractionArrow<A, A> =
//   <A, B>(arrow: ExtractionArrow<A, B>) => (ra: ExtractionResult<A>) => {
//     return pipe(
//       ra,
//       arrow,
//       TE.fold(
//         () => ra,
//         () => ra,
//       ),
//     );
//   };

// // TODO: This is actually Fanout
// // Given a single input A, produce an array of Bs by running the given array of functions on the initial A
// export const attemptAll: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B[]> =
//   <A, B>(...arrows: ExtractionArrow<A, B>[]) => (ra: ExtractionResult<A>) => {
//     return pipe(
//       ra,
//       TE.chain(([a, env]: W<A>) => {
//         const bbs = _.map(arrows, (arrow) => {
//           const env0 = _.clone(env);
//           return arrow(TE.right(asW(a, env0)));
//         });
//         const leftRightErrs = separateResults(bbs);
//         const rightTasks = pipe(
//           leftRightErrs,
//           Task.map(([_lefts, rights]) => {
//             const bs = _.map(rights, ([b]) => b);
//             const recs = _.flatMap(rights, ([, env]) => env.extractionRecords);
//             const env0 = _.clone(env);
//             env0.extractionRecords.push(...recs);
//             return asW(bs, env0);
//           })
//         );
//         return TE.fromTask(rightTasks);

//       })
//     );
//   };

// export const firstOf: typeof flow = flow;

// // Try each arrow on input until one succeeds
// export const attemptSeries: <A, B, Env = ExtractionEnv> (...arrows: ExtractionArrow<A, B, Env>[]) => ExtractionArrow<A, B, Env> =
//   <A, B, Env = ExtractionEnv>(...arrows: ExtractionArrow<A, B, Env>[]) => (ra: ExtractionResult<A, Env>) => {
//     // Base Case:
//     if (arrows.length === 0) return pipe(
//       ra,
//       TE.chain(([, env]) => {
//         return TE.left<WCI<Env>, W<B, Env>>(asW('continue', env));
//       })
//     );

//     // Recursive Step:
//     const headArrow: ExtractionArrow<A, B, Env> = arrows[0];
//     const tailAarrows: ExtractionArrow<A, B, Env> = attemptSeries(...arrows.slice(1));
//     return pipe(
//       ra,
//       headArrow, // if this returns left(..), try the next arrow
//       TE.alt(() => pipe(ra, tailAarrows))
//     );
//   };

// export const fanin: <A, B> (arrow: ExtractionArrow<A[], B>) => ExtractionArrow<A[], B> =
//   <A, B>(arrow: ExtractionArrow<A[], B>) => (ra: ExtractionResult<A[]>) => {
//     return pipe(
//       ra,
//       TE.chain((wa: W<A[]>) => {
//         return arrow(TE.right(wa));
//       })
//     );
//   };


// export function withEnv<A>(f: (env: ExtractionEnv) => ExtractionResultEA<A>): EnvFunction<A> {
//   const f0: ExtractionFunction<void, A> =
//     (_, env) => pipe(
//       f(env),
//       TE.map(a => asW(a, env)),
//       TE.mapLeft(e => asW(e, env)),
//     );

//   return f0;
// }


export const through: <A, B>(f: ClientFunc<A, B>) => ExtractionArrow<A, B>  =
  f => ft.through(f)

export const tap: <A>(f: ClientFunc<A, any>) => ExtractionArrow<A, A>  =
  f => ft.tap(f)

export const filter: <A>(f: ClientFunc<A, boolean>) => FilterArrow<A>  =
  f => ft.filter(f)
