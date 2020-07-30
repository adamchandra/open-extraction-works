
import _ from "lodash";

import 'chai/register-should';
import { prettyPrint, AlphaRecord, putStrLn } from 'commons';
import { Url } from './database-tables';
import { createEmptyDB } from './db-test-utils';
import { createAlphaRequest, createAlphaUpload } from './db-api';
import { Database } from './database';

describe('High-level Database API', () => {

  it('smokescreen', async (done) => {
    done();
  });
});
