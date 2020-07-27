import "chai/register-should";

import _ from "lodash";
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';
import { getWorkflowServiceLogger } from './service-comm';
import { prettyPrint, delay } from 'commons';
import FormData from 'form-data';
import fs from "fs-extra";
import got from 'got';


describe("End-to-end Extraction workflows", () => {


  it("should demo end-to-end processing", async (done) => {
    const log = getWorkflowServiceLogger();
    log.level = 'info';
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames,
      (service) => runService(service, false)
    );

    // await delay(500);

    await Promise.all(satellitePs);
    prettyPrint({ msg: 'services are running' });

    hubService.addHandlers('inbox', {
      async 'field-extractor:done'() {
        prettyPrint({ msg: 'done' });
        await hubService.broadcast('shutdown');
        await hubService.quit();
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
