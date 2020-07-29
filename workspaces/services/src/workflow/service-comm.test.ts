import "chai/register-should";

import _ from "lodash";
import { runServiceHub, runService, WorkflowServiceNames  } from './workflow-services';
import { defineSatelliteService, createSatelliteService, SatelliteService, ServiceHub, createHubService } from './service-hub';
import { putStrLn } from 'commons';
import Async from 'async';


async function createTestServices(n: number): Promise<[ServiceHub, Array<SatelliteService<void>>]> {
  const hubName = 'ServiceHub';
  const serviceNames = _.map(_.range(n), (i) => `service-${i}`);
  const [hubPool, hubConnected] = await createHubService(hubName, serviceNames);


  // TODO Async.mapXX seem to be buggy; if iterator fn is not declared as async (v) => {}, it doesn't work
  const satelliteServices = await Async.map<string, SatelliteService<void>, Error>(
    serviceNames, async (serviceName) => {
      const serviceDef = defineSatelliteService<void>(
        async () => undefined, {
      });
      return createSatelliteService(hubName, serviceName, serviceDef);
    });

  await hubConnected;
  putStrLn('createSatelliteService: after satelliteInits resolved')
  return [hubPool, satelliteServices];
}

describe("Service Communication Hub lifecycle", () => {
  it("should run hub, service lifecycles", async (done) => {
    const [hub,] = await createTestServices(3);

    await hub.commLink.broadcast('shutdown');
    await hub.commLink.quit();
    done();
  });


  it("should demo end-to-end startup/run/shutdown", async (done) => {
    const hubName = 'ServiceHub';
    const orderedServices = WorkflowServiceNames;
    const [hubService, hubConnected] = await runServiceHub(hubName, false, orderedServices);
    const satellitePs = _.map(
      orderedServices, (service) => {
        return runService(hubName, service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    const restPortal = _.filter(satellites, s => s.serviceName === 'rest-portal')[0];
    await hubConnected;

    // Fake a 'done' message;
    await restPortal.commLink.sendTo(hubName, 'done~run');

    hubService.commLink.addHandler(
      'inbox', 'field-extractor:done',
      async () => {
        await hubService.commLink.broadcast('shutdown');
        await hubService.commLink.quit();
        done();
      }
    );
  });

});
