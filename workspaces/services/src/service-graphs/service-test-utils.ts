import _ from 'lodash';
import { defineSatelliteService, createSatelliteService, SatelliteService, ServiceHub, createHubService } from './service-hub';
import Async from 'async';
import { newServiceComm, ServiceComm } from './service-comm';

// Create a Hub/Satellite service network with specified # of satellites
export interface TestService {
  commLink: ServiceComm<TestService>;
}

export async function createTestServices(n: number): Promise<Array<TestService>> {
  const serviceNames = _.map(_.range(n), (i) => `service-${i}`);

  const services = await Async.map<string, TestService, Error>(
    serviceNames,
    async (serviceName) => {
      const service: TestService = {
        commLink: newServiceComm(serviceName),
      };

      service.commLink.addHandlers({
        async quit() {
          await this.commLink.quit();
        }
      });

      await service.commLink.connect(service);
      return service;
    });

  return services;
}

export async function createTestServiceHub(n: number, runLog: string[]): Promise<[ServiceHub, Array<SatelliteService<void>>]> {
  const hubName = 'ServiceHub';
  const serviceNames = _.map(_.range(n), (i) => `service-${i}`);

  const recordLogMsgHandler = (svcName: string, scope: string) => async (msg: string) => {
    const logmsg = `${scope}: ${svcName}: ${msg}`;
    runLog.push(logmsg);
  }

  // TODO Async.mapXX seem to be buggy; if iterator fn is not declared as async (v) => {}, it doesn't work
  const satelliteServices = await Async.map<string, SatelliteService<void>, Error>(
    serviceNames,
    async (serviceName) => {
      const serviceDef = defineSatelliteService<void>(
        async () => undefined, {
          async step() {
            this.log.info(`${this.serviceName} [step]> `)
          },

          async run() {
            // this.log.info(`${this.serviceName} [run]> payload=${payload} `)
            this.log.info(`${this.serviceName} [run]> payload=??? `)
          },
      });

      const satService = await createSatelliteService(hubName, serviceName, serviceDef);
      satService.commLink.addHandlers( {
        async '.*'() {
          recordLogMsgHandler(serviceName, 'inbox')
        }
      });
      return satService;
    });

  const [hubPool, hubConnected] = await createHubService(hubName, serviceNames);

  hubPool.commLink.addHandlers( {
    async '.*'() {
      recordLogMsgHandler(hubPool.name, 'inbox')
    }
  });

  await hubConnected;
  return [hubPool, satelliteServices];
}

export function assertAllStringsIncluded(includeStrings: string[], entries: string[]): boolean {
  const atLeastOneMatchPerRegexp = _.every(includeStrings, (str) => {
    const someMatch = _.some(entries, entry => {
      return entry.includes(str);
    });
    if (!someMatch) {
      console.log('NO Matching Entry for', str);
    }
    return someMatch;
  })
  return atLeastOneMatchPerRegexp;
}
