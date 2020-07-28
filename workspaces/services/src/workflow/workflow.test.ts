import "chai/register-should";

import _ from "lodash";
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';
import {  } from './service-comm';
import { prettyPrint,  } from 'commons';
import FormData from 'form-data';
import fs from "fs-extra";
import got from 'got';


describe("End-to-end Extraction workflows", () => {
  const hubName = 'ServiceHub';


  it("should demo end-to-end processing", async (done) => {
    const hubService = await runServiceHub(hubName, false);
    const satellitePs = _.map(
      WorkflowServiceNames,
      (service) => runService(hubName, service, false)
    );

    // await delay(500);

    await Promise.all(satellitePs);
    prettyPrint({ msg: 'services are running' });

    hubService.getComm().addHandlers('inbox', {
      async 'field-extractor:done'() {
        prettyPrint({ msg: 'done' });
        await hubService.getComm().broadcast('shutdown');
        await hubService.getComm().quit();
        done();
      }
    });


    const getResponse = await got('http://localhost:3100/extractor/batch.csv');

    prettyPrint({ response: getResponse.body });

    const file = './test/resources/dblp_urls-10.csv';
    const formData = new FormData();
    formData.append('data', fs.readFileSync(file), 'dblp_urls.csv');

    const retval = await got.post('http://localhost:3100/extractor/batch.csv', { body: formData });
    prettyPrint({ msg: "out of pipeline", response: retval.body });
  });
});
