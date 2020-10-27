import 'chai/register-should';
import { prettyPrint, slidingWindow } from 'commons';

import _ from 'lodash';
import { chainServices } from './service-chain';
import { newServiceComm, ServiceComm } from './service-comm';

import {
  Dispatch,
  Message,
  // MessageHandler,
  // DispatchHandler,
  Ping,
  Quit,
  Yield
} from './service-defs';
import { createTestServices } from './service-test-utils';


describe('Redis-based Service Communication ', () => {
  process.env['service-comm.loglevel'] = 'debug';

  interface Service<S> {
    serviceComm: ServiceComm<S>;
  }

  interface MyController extends Service<MyController> {
  }

  interface MyService extends Service<MyService> {
  }

  interface MsgArg {
    callees: string[];
    logs: string[];
  }


  it.only('should push message and promise response', async (done) => {

    const testServices = await createTestServices(5);
    const commLinks = _.map(testServices, ts => ts.commLink);

    const chainFunc = chainServices('run', commLinks);

    _.each(testServices, (service) => {
      service.commLink.addDispatches({
        async run(msg: MsgArg) {
          this.commLink.log.info('run');
          msg.callees.push(this.commLink.name);
          return msg;
        }
      });
    });

    const initMsg: MsgArg = {
      callees: [],
      logs: []
    };

    const result = await chainFunc(initMsg);
    prettyPrint({ result });

    const quitting = _.map(testServices, s => s.commLink.quit());
    await Promise.all(quitting);
    done();
  });

  it('should pass messages between several services', async (done) => {

    const myService: MyService = {
      serviceComm: newServiceComm('service-1'),
    };

    myService.serviceComm.addDispatches({
      async callme(msg) {
        this.serviceComm.log.info('you called me!');
        prettyPrint({ p: 'callme', msg });
        return {
          x: 0,
          y: 'yes!'
        };
      }
    });

    myService.serviceComm.addHandlers({
      async ping(msg) {
        prettyPrint({ p: 'handler', msg });
      },

      async quit() {
        await this.serviceComm.quit();
        done();
      }
    });

    await myService.serviceComm.connect(myService);

    const myController: MyController = {
      serviceComm: newServiceComm('controller'),
    };
    await myController.serviceComm.connect(myController);

    await myController.serviceComm.send(
      Message.address(Ping, { to: 'service-1' })
    );

    await myController.serviceComm.send(
      Message.address(
        Dispatch.create('callme', '{ "key1": 34, "key2": { "key3": "and another!"}}'),
        { to: 'service-1' }
      )
    );


    await myController.serviceComm.send(
      Message.address(
        Quit,
        { to: 'service-1' }
      )
    );

    await myController.serviceComm.quit();

  });


});
