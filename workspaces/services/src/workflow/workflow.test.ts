import "chai/register-should";

import _ from "lodash";

// import { putStrLn, delay } from 'commons';
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';


describe("End-to-end Extraction workflows", () => {

  it("should execute hub, service startup/shutdown", async (done) => {
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames, (service) => {
        return runService(service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    await hubService.broadcast('shutdown');
    await hubService.quit();
    done();
  });

  it.only("should demo end-to-end processing", async (done) => {
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames, (service) => {
        return runService(service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    const restPortal = _.filter(satellites, s => s.serviceName === 'rest-portal')[0];

    // Fake a 'done' message;
    await restPortal.getServiceComm().sendTo('hub', 'done');

    hubService.addHandlers('inbox', {
      async 'field-extractor:done'() {
        await hubService.broadcast('shutdown');
        await hubService.quit();
        done();
      }

    })
  });

  // it("should create a hub shaped network of extraction clients", async (done) => { });

});
