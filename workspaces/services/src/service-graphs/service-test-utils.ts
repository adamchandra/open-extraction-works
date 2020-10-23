import _ from 'lodash';
import { defineSatelliteService, createSatelliteService, SatelliteService, ServiceHub, createHubService } from './service-hub';
import Async from 'async';

// Create a Hub/Satellite service network with specified # of satellites

export async function createTestServices(n: number, runLog: string[]): Promise<[ServiceHub, Array<SatelliteService<void>>]> {
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

          async run(payload: any) {
            this.log.info(`${this.serviceName} [run]> payload=${payload} `)
          },
      });

      const satService = await createSatelliteService(hubName, serviceName, serviceDef);
      satService.satComm.commLink.addHandler('inbox', '.*', recordLogMsgHandler(serviceName, 'inbox'));
      satService.satComm.commLink.addHandler('local', '.*', recordLogMsgHandler(serviceName, 'local'));
      return satService;
    });

  const [hubPool, hubConnected] = await createHubService(hubName, serviceNames);

  hubPool.commLink.addHandler('inbox', '.*', recordLogMsgHandler(hubPool.name, 'inbox'));
  hubPool.commLink.addHandler('local', '.*', recordLogMsgHandler(hubPool.name, 'local'));

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
