import "chai/register-should";

import _ from "lodash";

import { putStrLn, delay } from 'commons';

import { getHubRedisPool, getSatelliteRedisPool } from './workflow';
import { runService, WorkflowServiceNames, runServiceHub } from './workflow-server';


describe("End-to-end Extraction workflows", () => {

  it.only("should startup/shutdown one hub/service", async (done) => {

    const hubService = await runServiceHub(false);
    const satService = await runService('no-op', false);

    await hubService.broadcast('shutdown');

    // putStrLn('pre-delay');
    // await delay(2000);
    // putStrLn('post-delay');

    await hubService.quit();

    putStrLn('test is shutting down');

    done();
  });

  it("go through startup/shutdown", async (done) => {
    // TODO ensure that all services are started using ping/ack or somesuch

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

  // it("demo an end-to-end sys", async (done) => {});
  // it("should create a hub shaped network of extraction clients", async (done) => { });

});
