import 'chai/register-should';
import { prettyPrint } from 'commons';

import _ from 'lodash';
import { newServiceComm, ServiceComm } from './service-comm';
import {
  Dispatch,
  // MessageHandler,
  MessageHandlers,
  // DispatchHandler,
  DispatchHandlers,
  Message,
  MEvent,
  Yield
} from './service-defs';



describe('Redis-based Service Communication ', () => {
  process.env['service-comm.loglevel'] = 'silly';

  interface Service<S> {
    serviceComm: ServiceComm<S>;
  }

  interface MyController extends Service<MyController> {
  }

  interface MyService extends Service<MyService> {
  }

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
      Message.create({
        from: 'controller', to: 'service-1', messageType: 'ping'
      }, MEvent.create('Hey There!'))
    );

    await myController.serviceComm.send(
      Message.create({
        from: 'controller', to: 'service-1', messageType: 'dispatch'
      }, Dispatch.create('callme', '{ "key1": 34, "key2": { "key3": "and another!"}}'))
    );

    await myController.serviceComm.send(
      Message.create({
        from: 'controller', to: 'service-1', messageType: 'quit'
      }, { kind: 'empty' })
    );

    await myController.serviceComm.quit();

  });


});
