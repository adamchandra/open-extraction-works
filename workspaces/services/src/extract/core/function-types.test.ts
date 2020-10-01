import 'chai/register-should';
import _ from 'lodash';

import { consoleTransport, createConsoleLogger, newLogger, prettyPrint, putStrLn } from 'commons';
import * as ft from './function-types';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isRight, isLeft } from 'fp-ts/Either';
import Async from 'async';
import { flow, pipe } from 'fp-ts/function'
import { Logger } from 'winston';

// Extraction functions specialized to use boolean as the env type
interface EnvT {
  ns: [];
  b: boolean;
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
  log: Logger;
}

const asW = <A>(a: A, env: EnvT) => ft.asW<A, EnvT>(a, env);

type W<A> = ft.W<A, EnvT>;
const W = {
  lift: <A>(a: A, env: EnvT) => asW(a, env),
};

type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
const ClientFunc = ft.ClientFunc;

type EitherControlOrA<A> = ft.EitherControlOrA<A>;
type PostHook<A, B> = ft.PostHook<A, B, EnvT>;

type ExtractionResult<A> = ft.ExtractionResult<A, EnvT>;
const ExtractionResult = {
  lift: <A>(a: A, env: EnvT): ExtractionResult<A> => TE.right(asW(a, env)),
  liftW: <A>(wa: W<A>): ExtractionResult<A> => TE.right(wa),
  liftFail: <A>(ci: ft.ControlInstruction, env: EnvT): ExtractionResult<A> => TE.left(asW(ci, env)),
};


type ExtractionArrow<A, B> = ft.ExtractionArrow<A, B, EnvT>;
const ExtractionArrow = {
  lift: <A, B>(fab: ClientFunc<A, B>): ExtractionArrow<A, B> =>
    ft.ExtractionArrow.lift(fab)
};

export type FilterArrow<A> = ft.FilterArrow<A, EnvT>;
export type FanoutArrow<A, B> = (ra: ExtractionResult<A[]>) => ExtractionResult<B[]>;

export const named: <A, B>(name: string, arrow: ExtractionArrow<A, B>) => ExtractionArrow<A, B> = ft.named;
export const through: <A, B>(f: ClientFunc<A, B>, name?: string, h?: PostHook<A, B>) => ExtractionArrow<A, B> = ft.through;
export const tap: <A>(f: ClientFunc<A, any>, name?: string) => ExtractionArrow<A, A> = ft.tap;
export const filter: <A>(f: ClientFunc<A, boolean>, name?: string, h?: PostHook<A, boolean>) => FilterArrow<A> = ft.filter;

const logInfo = ft.logInfo;

describe('Extraction Prelude / Primitives', () => {
  const log = newLogger(consoleTransport('info'));
  const initEnv: EnvT = {
    ns: [],
    b: true,
    enterNS(_ns: string[]) {
      // putStrLn(`enter> ${_.join(ns, '/')}`);
    },
    exitNS(_ns: string[]) {
      // putStrLn(`exit> ${_.join(ns, '/')}`);
    },
    log,
  };
  const strlen = (s: string): number => s.length;

  const arrowStrLen: ExtractionArrow<string, number> =
    ExtractionArrow.lift(strlen)

  it('should create basic arrows/results', async (done) => {
    const wFoobar = W.lift('foobar', initEnv);
    const er1: ExtractionResult<string> = ExtractionResult.liftW(wFoobar);
    const er1res = await er1();

    expect(isRight(er1res) && er1res.right === wFoobar).toBe(true);

    const erLen = await arrowStrLen(er1)();
    expect(isRight(erLen) && erLen.right[0] === 6).toBe(true);

    done();
  });

  const forEachDo = <A, B>(arrow: ExtractionArrow<A, B>) => ft.forEachDo<A, B, EnvT>(arrow);
  const attemptSeries = <A, B>(...arrows: ExtractionArrow<A, B>[]) => ft.attemptSeries<A, B, EnvT>(...arrows);

  it('control flow: forEachDo', async (done) => {

    const strArray = _.map(
      _.range(3),
      (i) => _.repeat('x', i + 1)
    );

    const wStrArray = ExtractionResult.lift(strArray, initEnv);

    const res = await forEachDo(arrowStrLen)(wStrArray)();
    // prettyPrint({ res });
    expect(isRight(res)).toBe(true);

    if (isRight(res)) {
      const right = res.right;
      expect(right).toStrictEqual([[1, 2, 3], initEnv]);
    }

    done();
  });

  it('control flow: attemptSeries', async (done) => {
    let checkedNums: string[] = [];

    const isNumberArrow = (n: number) => ExtractionArrow.lift(
      (a: number) => {
        checkedNums.push(`is(${n}) ? ${a}`);
        return a === n ? E.right(a) : E.left('halt')
      }
    );

    const nums = _.map(_.range(10), (i) => ExtractionResult.lift(i, initEnv));
    const isNum = _.map(_.range(10), (i) => isNumberArrow(i));

    await Async.eachSeries(_.range(5), async i => {
      checkedNums = [];
      const result = await attemptSeries(
        ...isNum.slice(1, 3)
      )(nums[i])();
      if (i === 1 || i === 2) {
        expect(isRight(result) && result.right[0] === i).toBe(true);
      } else {
        expect(isLeft(result) && result.left[0] === 'continue').toBe(true);
      }
    });

    checkedNums = [];
    const resEmpty = await attemptSeries()(nums[0])();
    expect(isLeft(resEmpty) && resEmpty.left[0] === 'continue').toBe(true);

    done();
  });

  it('tap() composition', async (done) => {
    const urlFilter: FilterArrow<string> =
      flow(
        tap((a) => putStrLn(`starting URL filter ${a} `)),
        tap((a) => putStrLn(`ending URL filter ${a}`)), // <- tap(['my..', true]) => putStrLn(..)
      );
    const extractionPipeline =
      urlFilter

    await extractionPipeline(TE.right(['my love E.M.', initEnv]))();


    done();
  });



  it.only('attemptSeries() composition', async (done) => {

    const urlFilter: FilterArrow<string> =
      attemptSeries(
        flow(
          logInfo((a) => `A. starting URL filter ${a} `),
          filter((a) => /love/.test(a), 'm/love/'),
          logInfo((a) => `A. ending URL filter ${a}`), // <- tap(['my..', true]) => putStrLn(..)
          filter((a) => /her/.test(a), 'm/her/'),
          through(() => ClientFunc.halt('save for later.'))
        ),
        flow(
          logInfo((a) => `B. starting URL filter ${a} `),
          logInfo((a) => `B. ending URL filter ${a}`),
          filter((a) => /you/.test(a), 'm/you/'),
          through(() => ClientFunc.halt('not this one either.'))
        ),
        flow(
          logInfo((a) => ` C. starting URL filter ${a} `),
          filter((a) => /my/.test(a), 'm/my/'),
          through(() => ClientFunc.success('this is it!'))
        ),
      );

    const extractionPipeline = urlFilter

    await extractionPipeline(TE.right(['my love E.M.', initEnv]))();

    done();
  });
});
