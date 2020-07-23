import "chai";
import "chai/register-should";

import _ from "lodash";
import { makeHashEncodedPath } from './persist';
import { prettyPrint } from 'commons';


describe("spider persistence", () => {

  it("should create hash-encoded paths of specified depth", () => {
    const examples = [
      'http://example.com',
      'qwerty',
    ];
    _.each(examples, example => {
      _.each(_.range(2, 4), (n) => {
        const encPath = makeHashEncodedPath(example, n);
        const asPath = encPath.toPath();
        // const asResolvedPath = encPath.toResolvedPath();
        prettyPrint({ encPath, asPath });
      });
    });
  });
});
