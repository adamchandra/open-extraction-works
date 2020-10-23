import 'chai/register-should';
import { prettyPrint } from 'commons/dist';

import _ from 'lodash';
import { newRedis } from './ioredis-conn';
import { newServiceComm, ServiceComm } from './service-comm';
import { Message, MEvent } from './service-defs';
// import { Forward, Message, MEvent } from './service-defs';
// import { createTestServices, assertAllStringsIncluded } from './service-test-utils';

describe('Redis-based Service Communication ', () => {
  process.env['service-comm.loglevel'] = 'warn';

  interface MyService {
    serviceComm: ServiceComm<MyService>;
  }

  it('should pass messages between several services', async (done) => {
    const mainRedis = newRedis('main');

    const msg = Message.create({
      from: 'me', to: 'you', messageType: 'ping'
    }, MEvent.create('Hey There!'))
    const pmsg = Message.pack(msg);


    const myService: MyService = {
      serviceComm: newServiceComm<MyService>('service-1')
    }
    await myService.serviceComm.connect(myService);

    await mainRedis.publish('service-1', pmsg);


    await myService.serviceComm.quit();
    await mainRedis.quit();


    done();
  });


});
