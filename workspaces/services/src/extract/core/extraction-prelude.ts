import _ from 'lodash';

import * as E from 'fp-ts/Either';
import { Metadata } from '~/spidering/data-formats';
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

export type ControlCode = ft.ControlCode;
export type ControlInstruction = ft.ControlInstruction;

type EnvT = ExtractionEnv;
const asW = <A>(a: A, env: EnvT) => ft.asW<A, EnvT>(a, env);

export type W<A> = ft.W<A, EnvT>;
export const W = {
  lift: <A>(a: A, env: EnvT) => asW(a, env),
};
export type WCI = ft.WCI<EnvT>;


export type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
export type ClientResult<A> = ft.ClientResult<A>;

export const ClientFunc = {
  success: <A>(a: A): E.Either<ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['continue', msg]),
}

export type ExtractionResult<A> = ft.ExtractionResult<A, EnvT>;
// export const ExtractionResult = {
//   lift: <A>(a: A, env: EnvT): ExtractionResult<A> => TE.right(asW(a, env)),
//   liftW: <A>(wa: W<A>): ExtractionResult<A> => TE.right(wa),
//   liftFail: <A>(ci: ft.ControlInstruction, env: EnvT): ExtractionResult<A> => TE.left(asW(ci, env)),
// };


export type ExtractionArrow<A, B> = ft.ExtractionArrow<A, B, EnvT>;

export const ExtractionArrow = {
  lift: <A, B>(fab: ClientFunc<A, B>): ExtractionArrow<A, B> =>
    ft.ExtractionArrow.lift(fab)
};


export type ExtractionFunction<A, B> = ft.ExtractionFunction<A, B, EnvT>;
export type FilterArrow<A> = ft.FilterArrow<A, EnvT>;
export type ExtractionEither<A> = ft.ExtractionEither<A, EnvT>;
export type FilterFunction<A> = ft.FilterFunction<A, EnvT>;
export type EnvFunction<A> = ft.EnvFunction<A, EnvT>;

export type FanoutArrow<A, B> = (ra: ExtractionResult<A[]>) => ExtractionResult<B[]>;
// export type FaninArrow<A, B, Env = ExtractionEnv> = (ra: ExtractionResult<A[], Env>) => ExtractionResult<B, Env>;


export const forEachDo: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
  ft.forEachDo;

// export const fanout: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
//   ft.fanout;

// export const attempt: <A, B> (arrow: ExtractionArrow<A, B>) => ExtractionArrow<A, A> =
//   ft.attempt;

export const attemptSeries: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B> =
  ft.attemptSeries;

export const applyAll: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B[]> =
  ft.applyAll;

// export const bind_: <A, B> (f: ExtractionFunction<A, B>) => ExtractionArrow<A, B> =
//   (f) => ft.bind_(f);

// export const bind: <A, B> (f: ExtractionFunction<A, B>) => ExtractionArrow<A, B> =
//   (f) => ft.bind(f);

export const through: <A, B>(f: ClientFunc<A, B>) => ExtractionArrow<A, B>  =
  f => ft.through(f)

export const tap: <A>(f: ClientFunc<A, any>) => ExtractionArrow<A, A>  =
  f => ft.tap(f)

export const filter: <A>(f: ClientFunc<A, boolean>) => FilterArrow<A>  =
  f => ft.filter(f)
