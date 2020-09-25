import 'chai/register-should';
import _ from 'lodash';

import { prettyPrint } from 'commons';
import { runUntilSuccess } from './extraction-prelude';
import * as ep from './extraction-prelude';
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function'
import { isRight, isLeft } from 'fp-ts/Either';
import Async from 'async';

describe('Extraction Prelude / Primitives', () => {
  type EnvT = boolean;
  const asW = <A>(a: A, env: EnvT) => ep.asW<A, EnvT>(a, env);

  type W<A> = ep.W<A, EnvT>;
  const W = {
    lift: <A>(a: A, env: EnvT) => asW(a, env),
  };

  type ClientFunc<A, B> = ep.ClientFunc<A, B, EnvT>;
  type ClientResultEither<A> = ep.ClientResultEither<A>;
  type ClientFuncEither<A, B> = ep.ClientFuncEither<A, B, EnvT>;


  type WCI = ep.WCI<EnvT>
  type ExtractionResult<A> = ep.ExtractionResult<A, EnvT>;
  const ExtractionResult = {
    lift: <A>(a: A, env: EnvT): ExtractionResult<A> => TE.right(asW(a, env)),
    liftW: <A>(wa: W<A>): ExtractionResult<A> => TE.right(wa),
    liftFail: <A>(ci: ep.ControlInstruction, env: EnvT): ExtractionResult<A> => TE.left(asW(ci, env)),
  };


  type ExtractionArrow<A, B> = ep.ExtractionArrow<A, B, EnvT>;
  const ExtractionArrow = {
    lift: <A, B>(fab: (a: A) => B): ExtractionArrow<A, B> =>
      (er: ExtractionResult<A>) => pipe(er, TE.fold(
        ([, env]) => ExtractionResult.liftFail('halt', env),
        ([s, env]) => ExtractionResult.lift(fab(s), env),
      )),

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
      ))
  }

  const strlen = (s: string): number => s.length;

  const arrowStrLen: ExtractionArrow<string, number> =
    ExtractionArrow.lift(strlen)

  it('should create basic arrows/results', async (done) => {
    const wFoobar = W.lift('foobar', true);
    const er1: ExtractionResult<string> = ExtractionResult.liftW(wFoobar);
    const er1res = await er1();

    expect(isRight(er1res) && er1res.right === wFoobar).toBe(true);

    prettyPrint({ wFoobar, er1, er1res });


    const erLen = await arrowStrLen(er1)();
    prettyPrint({ erLen });
    expect(isRight(erLen) && erLen.right[0] === 6).toBe(true);


    done();
  });

  const forEachDo = <A, B>(arrow: ExtractionArrow<A, B>) => ep.forEachDo<A, B, EnvT>(arrow);
  const runUntilSuccess = <A, B>(...arrows: ExtractionArrow<A, B>[]) => ep.runUntilSuccess<A, B, EnvT>(...arrows);

  it('control flow: forEachDo', async (done) => {

    const strArray = _.map(
      _.range(3),
      (i) => _.repeat('x', i + 1)
    );

    const wStrArray = ExtractionResult.lift(strArray, true);

    const res = await forEachDo(arrowStrLen)(wStrArray)();
    expect(isRight(res) && res.right[0] === [1, 2, 3]).toBe(true);
    prettyPrint({ res });

    done();
  });
  it.only('control flow: runUntilSuccess', async (done) => {
    let checkedNums: string[] = [];

    // successArrow =  ExtractionArrow.lift()
    const isNumberArrow = (n: number) => ExtractionArrow.liftClientEither(
      (a: number) => {
        checkedNums.push(`is(${n}) ? ${a}`);
       return a === n ? E.right(a) : E.left('halt')
      }
    );

    const nums = _.map(_.range(10), (i) => ExtractionResult.lift(i, true));
    const isNum = _.map(_.range(10), (i) => isNumberArrow(i));

    await Async.eachSeries(_.range(5), async i => {
      checkedNums = [];
      const result = await runUntilSuccess(
        ...isNum.slice(1, 3)
      )(nums[i])();
      if (i === 1 || i === 2) {
        expect(isRight(result) && result.right[0] === i).toBe(true);
      } else {
        expect(isLeft(result) && result.left[0] === 'continue').toBe(true);
      }

      // prettyPrint({ i, result, checkedNums });
    })

    checkedNums = [];
    const resEmpty = await runUntilSuccess()(nums[0])();
    expect(isLeft(resEmpty) && resEmpty.left[0] === 'continue').toBe(true);


    done();
  });

});
