import "chai/register-should";

import _ from "lodash";

import { putStrLn, delay } from 'commons';

import { getHubRedisPool, getSatelliteRedisPool } from './workflow';


describe("End-to-end Extraction workflows", () => {

  it("demo an end-to-end sys", async (done) => {
    const hubPool = await getHubRedisPool('hub')

    hubPool.handleInbox({
      'rest-portal:upload': async () => {
        await hubPool.sendTo('upload-ingestor', 'start');
      },
      'upload-ingestor:done': async () => {
        await hubPool.sendTo('spider', 'start');
      },
      'spider:done': async () => {
        await hubPool.sendTo('extractor', 'start');
      },
    });


    const ingestorPool = await getSatelliteRedisPool('upload-ingestor');
    ingestorPool.handleInbox({
      'start': async () => {
        // figure out which urls we know about, which fields, etc.,
        // create a response json detailing what we have/don't have,
        //    and endpoints to download, check status, etc.
      },
    });

    const restPortal = await getSatelliteRedisPool('rest-portal')
    await restPortal.sendTo('hub', 'upload');

    await delay(2000);
    putStrLn('shutting down');
    Promise.all(_.map([
      restPortal.quit(),
      hubPool.quit(),
      ingestorPool.quit(),
    ])).then(() => done());

  });

  // it("should create a hub shaped network of extraction clients", async (done) => {
  //   // const pool = createClientPool()
  //   // createHubClient('extraction', ['spider', 'extractor', 'portal'])
  //   // createSatelliteClient('extraction', 'spider')
  // });

});
