import "chai/register-should";

import _ from "lodash";
import {
  createHubService,
} from './workflow';

import { prettyPrint } from 'commons';

import Redis from 'ioredis';

describe("IORedis library tests and examples", () => {

  it("should do async set/get ", async (done) => {
    const rclient = new Redis();
    await rclient.set('mykey', 'my-value')
      .then(() => {
        console.log('okay!');
      }).catch((error) => {
        console.log('Error', error);
      });

    await rclient.get('mykey')
      .then((value) => {
        console.log('got', value);
      }).catch((error) => {
        console.log('Error', error);
      });

    return rclient.quit()
      .then(() => done());
  });

  it("should do pub/sub", async (done) => {
    const rclient =  new Redis();
    const subClient =  new Redis();

    const subRet = await subClient.subscribe("topic.foo");
    await subClient.subscribe("exit");
    prettyPrint({ subRet });
    const pubRet = await rclient.publish("topic.foo", "foo.msg");
    prettyPrint({ pubRet });

    subClient.on("message", (channel, message) => {
      console.log('got message', channel, message);
    });

    rclient.publish('exit', 'quit');

    subClient.on("message", (channel, message) => {
      if (channel === 'exit' && message === 'quit')
      rclient.quit()
        .then(() => subClient.quit())
        .then(() => done());
    });
  });

});
