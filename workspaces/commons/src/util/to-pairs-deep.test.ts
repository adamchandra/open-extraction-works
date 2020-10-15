import 'chai';
import _ from 'lodash';
import { prettyPrint } from './pretty-print';
import { getQualifiedKey, getQualifiedValue, toIQualifiedPaths, toQualifiedKeyValues, toQualifiedPath } from './to-pairs-deep';


describe('toPairsDeep implementation', () => {

  const sampleRec: Record<string, any> = {
    quux: [
      {
        alpha: {
          omega: 1
        },
        crux: null,
        crax: undefined,
        gamma: {
          romeo: 'capulet',
          houses: 2,
        },
        baz: [
          {
            alpha: 'alpha',
            beta: 33,
          },
          'alpha',
          false,
        ]
      }
    ],
    bar: 'some bar value',
  };



  it('should create a list of all paths/values in object', () => {
    const examples = [
      sampleRec,
    ];

    _.each(examples, example => {
      const pathPairs = toIQualifiedPaths(example);
      // prettyPrint({ pathPairs });
      _.each(pathPairs, (iqPath) => {
        // const [iqkey, iqval] = iqPath;
        const qpath = toQualifiedPath(iqPath);
        const [pathKey] = getQualifiedKey(qpath);
        const pathValue = getQualifiedValue(qpath);
        prettyPrint({ iqPath, qpath, pathKey, pathValue });
        if (pathValue) {
          const recValue = _.get(example, pathKey);
          expect(recValue).toBe(pathValue[0]);
        }
      });
      const pathsWithValues = toQualifiedKeyValues(example);

      prettyPrint({ pathsWithValues });
    });
  });
});
