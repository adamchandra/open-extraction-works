import 'chai/register-should';
import _ from 'lodash';


import { prettyPrint, putStrLn } from 'commons';
// import * as ep from './extraction-prelude';
import * as ft from './function-types';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isRight, isLeft } from 'fp-ts/Either';
import Async from 'async';
import { flow } from 'fp-ts/function'

// Extraction functions specialized to use boolean as the env type
type EnvT = boolean;
const asW = <A>(a: A, env: EnvT) => ft.asW<A, EnvT>(a, env);

type W<A> = ft.W<A, EnvT>;
const W = {
  lift: <A>(a: A, env: EnvT) => asW(a, env),
};

type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
const ClientFunc = ft.ClientFunc;

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

export const through: <A, B>(f: ClientFunc<A, B>) => ExtractionArrow<A, B> =
  f => ft.through(f)

export const tap: <A>(f: ClientFunc<A, any>) => ExtractionArrow<A, A> =
  f => ft.tap(f)

export const filter: <A>(f: ClientFunc<A, boolean>) => FilterArrow<A> =
  f => ft.filter(f)

// export const fanout: <A, B> (arrow: ExtractionArrow<A, B>) => FanoutArrow<A, B> =
//   ft.fanout;

describe('Extraction Prelude / Primitives', () => {
  const strlen = (s: string): number => s.length;

  const arrowStrLen: ExtractionArrow<string, number> =
    ExtractionArrow.lift(strlen)

  it('should create basic arrows/results', async (done) => {
    const wFoobar = W.lift('foobar', true);
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

    const wStrArray = ExtractionResult.lift(strArray, true);

    const res = await forEachDo(arrowStrLen)(wStrArray)();
    prettyPrint({ res });
    expect(isRight(res)).toBe(true);

    if (isRight(res)) {
      const right = res.right;
      expect(right).toStrictEqual([[1, 2, 3], true]);
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

    const nums = _.map(_.range(10), (i) => ExtractionResult.lift(i, true));
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

    })

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

    const res = await extractionPipeline(TE.right(['my love E.M.', true]))();

    prettyPrint({ res });

    done();
  });

  it.only('attemptSeries() composition', async (done) => {
    const urlFilter: FilterArrow<string> =
      attemptSeries(
        flow(
          tap((a) => putStrLn(`A. starting URL filter ${a} `)),
          tap((a) => putStrLn(`A. ending URL filter ${a}`)), // <- tap(['my..', true]) => putStrLn(..)
          through(() => ClientFunc.halt('save for later.'))
        ),
        flow(
          tap((a) => putStrLn(`B. starting URL filter ${a} `)),
          tap((a) => putStrLn(`B. ending URL filter ${a}`)), // <- tap(['my..', true]) => putStrLn(..)
        ),
      );
    const extractionPipeline =
      urlFilter

    const res = await extractionPipeline(TE.right(['my love E.M.', true]))();

    prettyPrint({ res });

    done();
  });
});

    // const urlFilter: (urlTest: RegExp) => FilterArrow<any> =
    //   (regex) => flow(
    //     tap(() => putStrLn('starting URL filter ')),
    //     // flow(
    //     //   through(() => 'http://adam.org'),
    //     //   // filter(url => regex.test(url)),
    //     //   tap((a) => putStrLn(`matched URL ${a} to /${regex.source}/`)),
    //     // ),
    //     flow(
    //       // through(() => '200'),
    //       // tap((a, { log }) => putStrLn(`(isopress) checking status: ${a}`)),
    //       // filter((status) => status === '200'),
    //       // tap((a, { log }) => putStrLn(`(isopress) status okay: ${a}`)),
    //       through(() => ['a', 'b', 'c']),//  listResponseBodies,
    //       // tap((a) => putStrLn(`(isopress) listResponseBodies: ${a}`)),
    //       // fanout(
    //       //   flow(
    //       //     tap((a) => putStrLn(`(isopress) verifyFileType: ${a}`)),
    //       //     // verifyFileType(/html|xml/i),
    //       //     // tap((a) => putStrLn(`(isopress) runHtmlTidy: ${a}`)),
    //       //     // runHtmlTidy,
    //       //   )
    //       // ),
    //     ),
    //     tap(() => putStrLn('ending URL filter')),
    //   );
