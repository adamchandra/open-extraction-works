import _ from 'lodash';

import * as E from 'fp-ts/Either';
import { Metadata } from '~/spidering/data-formats';
import { Logger } from 'winston';
import { ExtractionEvidence, Field } from './extraction-records';
import * as ft from './function-types';


export interface NormalForms {
  'css-norm': null;
  'original': null;
  'tidy-norm': null
}

export type NormalForm = keyof NormalForms;


export type ExtractionEnv = {
  log: Logger;
  ns: string[];
  entryPath: string;
  metadata: Metadata;
  fieldRecs: Record<string, Field[]>;
  fields: Field[];
  evidence: ExtractionEvidence[];
  fileContentCache: Record<string, string>;
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
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


export type EitherControlOrA<A> = ft.EitherControlOrA<A>;
export type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
export type ControlFunc = ft.ControlFunc<EnvT>;
export type ClientResult<A> = ft.ClientResult<A>;

export const ClientFunc = {
  success: <A>(a: A): E.Either<ControlInstruction, A> => E.right(a),
  halt: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['halt', msg]),
  continue: <A>(msg: string): E.Either<ControlInstruction, A> => E.left(['continue', msg]),
}

export type ExtractionResult<A> = ft.ExtractionResult<A, EnvT>;
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

export const forEachDo: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> = ft.forEachDo;
export const attemptSeries: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B> = ft.attemptSeries;
export const applyAll: <A, B> (...arrows: ExtractionArrow<A, B>[]) => ExtractionArrow<A, B[]> = ft.applyAll;
export const named: <A, B>(name: string, arrow: ExtractionArrow<A, B>) => ExtractionArrow<A, B> = ft.named;
export const through: <A, B>(f: ClientFunc<A, B>, name?: string) => ExtractionArrow<A, B> = ft.through;
export const tap: <A>(f: ClientFunc<A, any>, name?: string) => ExtractionArrow<A, A> = ft.tap;
export const tapLeft: <A>(f: ControlFunc) => ExtractionArrow<A, A> = ft.tapLeft;
export const throughLeft: <A>(f: ControlFunc) => ExtractionArrow<A, A> = ft.throughLeft;
export const filter: <A>(f: ClientFunc<A, boolean>, name?: string) => FilterArrow<A> = ft.filter;


export const logInfo = ft.logInfo;
export const logDebug = ft.logDebug;
