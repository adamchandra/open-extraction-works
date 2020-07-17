import "chai/register-should";

import _ from "lodash";

import { putStrLn } from 'commons';

import { getNamedRedisPool } from './workflow';

export interface ChannelMessages {
  'hub.inbox': null;
  'upload-ingestor.inbox': null;
  'hub.broadcast': {
    'shutdown': null;
  }
}

describe("End-to-end Extraction workflows", () => {


  it("demo an end-to-end sys", async (done) => {
    const hubPool = await getNamedRedisPool('hub')


    hubPool.handleInbox({
      'rest-portal:upload.event': async () => {
        // mv upload.tmp -> upload-ingestor/inbox/tmp-xxx-file
        await hubPool.sendTo('upload-ingestor', 'upload.event');
      },
      'ingested.event': async () => {
        await hubPool.sendTo('spider', 'new.urls');
      },
      'spidered.urls': async () => {
        await hubPool.sendTo('extractor', 'new.htmls');
      },
      'shutdown.event': async () => {
        await hubPool.sendTo('extractor', 'new.htmls');
        await hubPool.broadcast('shutdown.event');
        await hubPool.quit();
      },
    });

    const ingestorPool = await getNamedRedisPool('upload-ingestor');
    ingestorPool.handleInbox({
      'upload.event': async () => {
        // figure out which urls we know about, which fields, etc.,
        // create a response json detailing what we have/don't have,
        //    and endpoints to download, check status, etc.

        // await uploadIngestorOutgoing.publish('hub.inbox.upload-ingestor', 'ingested.event')
        return ingestorPool.sendTo('hub', 'done');
      },
    });

    ingestorPool.handleBroadcasts({
      'hub:shutdown': async () => {
        await ingestorPool.quit();
      },
    });

    // const restPortalInbox = new Redis();
    // const restPortalOutgoing = new Redis();
    // await restPortalInbox.subscribe('spider.inbox', 'hub.broadcast');
    // restPortalInbox.on('message', (channel: string, msg: string) => {
    //   console.log(`restPortal :: ${channel} : ${msg}`);
    //   switch (msg) {
    //     case 'shutdown.event': {
    //       restPortalInbox.quit();
    //       restPortalOutgoing.quit();
    //       break;
    //     }
    //   }
    // });


    // // When new file uploaded:
    // // await restPortalOutgoing.publish('hub.inbox.portal', 'csv.upload');

    // const spiderInbox = new Redis();
    // const spiderOutgoing = new Redis();
    // await spiderInbox.subscribe('spider.inbox', 'hub.broadcast');
    // spiderInbox.on('message', (channel: string, msg: string) => {
    //   console.log(`spiderInbox :: ${channel} : ${msg}`);
    //   switch (msg) {
    //     case 'new.urls': {
    //       // copy new urls file to fs ./spider/inbox
    //       // launch spider if not already running
    //       break;
    //     }

    //     case 'shutdown.event': {
    //       spiderInbox.quit();
    //       spiderOutgoing.quit();
    //       break;
    //     }
    //   }
    // });

    // When spider finished a batch:
    // spiderOutgoing.publish('hub.inbox.spider', 'spidered.urls')

    const restPortal = await getNamedRedisPool('rest-portal')
    await restPortal.sendTo('hub', 'upload.event');

    // await delay(2000);
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
