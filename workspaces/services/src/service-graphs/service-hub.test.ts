import 'chai/register-should';
import { prettyPrint } from 'commons';

import _ from 'lodash';
import {  Message,  } from './service-defs';
import {  assertAllStringsIncluded, createTestServiceHub } from './service-test-utils';

describe('Service Communication Hub lifecycle', () => {
  process.env['service-comm.loglevel'] = 'silly';

  it('should startup, link, and shutdown service hub with satellites', async (done) => {
    const logMessages: string[] = [];
    const numServices = 3;
    const expectedMessages = _.flatMap(_.range(numServices), svcNum => {
      return [
        `service-${svcNum}: ServiceHub:link`,
        `ServiceHub: service-${svcNum}:ack~link`,
        `ServiceHub: service-${svcNum}:done~link`,
        `service-${svcNum}: ServiceHub:shutdown`,
        `ServiceHub: service-${svcNum}:ack~shutdown`,
      ];
    })

    const [hub,] = await createTestServiceHub(numServices, logMessages);

    await hub.shutdownSatellites();

    await hub.commLink.quit();

    // const receivedAllExpectedMessages = assertAllStringsIncluded(expectedMessages, logMessages);
    // expect(receivedAllExpectedMessages).toBe(true);
    done();
  });


  // it("should pass control between services on 'run' message", async (done) => {
  //   const logMessages: string[] = [];
  //   const numServices = 3;
  //   const expectedMessages = _.flatMap(_.range(numServices), svcNum => {
  //     return [
  //       `inbox: ServiceHub: service-${svcNum}:done~run`,
  //       `inbox: service-${svcNum}: ServiceHub:run`,
  //     ];
  //   })

  //   const [hub] = await createTestServices(numServices, logMessages);

  //   hub.commLink.addHandler(
  //     'inbox', `service-${numServices - 1}:done~run`,
  //     async () => {
  //       await hub.shutdownSatellites();
  //       await hub.commLink.quit();

  //       const receivedAllExpectedMessages = assertAllStringsIncluded(expectedMessages, logMessages);
  //       expect(receivedAllExpectedMessages).toBe(true);
  //       done();
  //     }
  //   );
  //   await hub.commLink.sendTo('service-0', 'run');
  // });


  // it("should pass control between services on 'step' message", async (done) => {
  //   const logMessages: string[] = [];
  //   const numServices = 3;
  //   const expectedMessages = _.flatMap(_.range(numServices), svcNum => {
  //     return [
  //       `inbox: ServiceHub: service-${svcNum}:done~step`,
  //       `inbox: service-${svcNum}: ServiceHub:step`,
  //     ];
  //   })
  //   const [hub] = await createTestServices(numServices, logMessages);

  //   hub.commLink.addHandler(
  //     'inbox', `service-${numServices - 1}:done~step`,
  //     async () => {
  //       await hub.shutdownSatellites();
  //       await hub.commLink.quit();
  //       const receivedAllExpectedMessages = assertAllStringsIncluded(expectedMessages, logMessages);
  //       expect(receivedAllExpectedMessages).toBe(true);
  //       done();
  //     }
  //   );

  //   await hub.commLink.sendTo('service-0', 'step');
  // });

  // it('should run/yield/yield-back, passing arguments between services, wait for response', async (done) => {
  //   process.env['service-comm.loglevel'] = 'debug';

  //   const logMessages: string[] = [];
  //   const numServices = 3;
  //   const [hub, satellites] = await createTestServices(numServices, logMessages);

  //   console.log('createTestServices complete')

  //   const sat0 = satellites[0];
  //   const finalString = await sat0.satComm.yield<string, string>('initial string');


  //   prettyPrint({ finalString });

  //   // shutdown
  //   await hub.shutdownSatellites();
  //   await hub.commLink.quit();
  //   done();
  // });

});
