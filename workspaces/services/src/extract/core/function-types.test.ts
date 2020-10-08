import 'chai/register-should';
import _ from 'lodash';

import { consoleTransport, newLogger, putStrLn } from 'commons';
import * as ft from './function-types';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isRight, isLeft } from 'fp-ts/Either';
import Async from 'async';
import { flow as compose } from 'fp-ts/function'
import { Logger } from 'winston';

interface EnvT {
  ns: [];
  b: boolean;
  msg: string;
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
  log: Logger;
}

const fp = ft.createFPackage<EnvT>();

type ExtractionResult<A> = ft.ExtractionResult<A, EnvT>;
type Arrow<A, B> = ft.Arrow<A, B, EnvT>;
type FilterArrow<A> = ft.FilterArrow<A, EnvT>;

const {
  tap,
  log,
  filter,
  ClientFunc,
  Arrow,
  ExtractionResult,
  asW,
  forEachDo,
  attemptSeries,
  composeSeries,
} = fp;


describe('Extraction Prelude / Primitives', () => {
  const logger = newLogger(consoleTransport('info'));
  const initEnv: EnvT = {
    ns: [],
    b: true,
    msg: 'begin',
    enterNS(_ns: string[]) {
      // putStrLn(`enter> ${_.join(ns, '/')}`);
    },
    exitNS(_ns: string[]) {
      // putStrLn(`exit> ${_.join(ns, '/')}`);
    },
    log: logger,
  };
  const strlen = (s: string): number => s.length;

  const arrowStrLen: Arrow<string, number> =
    Arrow.lift(strlen)

  it('should create basic arrows/results', async (done) => {
    const wFoobar = asW('foobar', initEnv);
    const er1: ExtractionResult<string> = ExtractionResult.liftW(wFoobar);
    const er1res = await er1();

    expect(isRight(er1res) && er1res.right === wFoobar).toBe(true);

    const erLen = await arrowStrLen(er1)();
    expect(isRight(erLen) && erLen.right[0] === 6).toBe(true);

    done();
  });

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

    const isNumberArrow = (n: number) => Arrow.lift(
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
      compose(
        tap((a) => putStrLn(`starting URL filter ${a} `)),
        tap((a) => putStrLn(`ending URL filter ${a}`)), // <- tap(['my..', true]) => putStrLn(..)
      );
    const extractionPipeline =
      urlFilter

    await extractionPipeline(TE.right(['my love E.M.', initEnv]))();


    done();
  });

  it('composeSeries/attemptSeries', async (done) => {
    let logs: string[] = [];
    const inputString = TE.right(asW('Four score and seven years', initEnv));

    const succeedingFunc = compose(
      tap(() => logs.push('s1')),
      filter<string>((a) => /Four/.test(a)),
      tap(() => logs.push('s2')),
    );

    const failingFunc = compose(
      tap(() => logs.push('e1')),
      filter<string>((a) => /Five/.test(a)),
      tap(() => logs.push('e2')),
    );

    await composeSeries(
      succeedingFunc,
      failingFunc,
      failingFunc,
    )(inputString)();

    expect(logs).toStrictEqual(['s1', 's2', 'e1'])

    logs = [];
    await attemptSeries(
      succeedingFunc,
      failingFunc,
      failingFunc,
    )(inputString)();

    expect(logs).toStrictEqual(['s1', 's2'])

    logs = [];
    await composeSeries(
      failingFunc,
      succeedingFunc,
      failingFunc,
    )(inputString)();

    expect(logs).toStrictEqual(['e1'])

    logs = [];
    await attemptSeries(
      failingFunc,
      failingFunc,
      succeedingFunc,
    )(inputString)();

    expect(logs).toStrictEqual(['e1', 'e1', 's1', 's2'])

    done();
  });


  it('filter composition', async (done) => {
    // liftFilter

    //   ifThen(
    //     allOf(
    //       haveEvidence(/abstractInFull/),
    //       haveEvidence(/og:description/),
    //     ), requireAll(doRun(
    //       applyLabel('abstract', textForEvidence('abstractInFull')),
    //       applyLabel('title', textForEvidence('og:description')),
    //     ))
    //   )


    done();
  });

});
