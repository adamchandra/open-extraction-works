import "chai/register-should";

import _ from "lodash";
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';
import { prettyPrint, AlphaRecord, } from 'commons';
import got from 'got';

describe("End-to-end Extraction workflows", () => {
  const hubName = 'ServiceHub';
  const orderedServices = WorkflowServiceNames;

  const sampleRecs: AlphaRecord[] = _.map(_.range(4), (n) => {
    return ({
      noteId: `note-${n}`,
      dblpConfId: `dblp.org/conf/c-${n}/199${n}`,
      title: `title-${n}`,
      authorId: `auth-${n}`,
      url: `http://foo.bar/${n}`,
    })
  })


  it("should demo end-to-end processing", async (done) => {
    const [hubService, hubConnected] = await runServiceHub(hubName, false, orderedServices);
    _.each(
      orderedServices,
      (service) => runService(hubName, service, false)
    );

    await hubConnected;
    prettyPrint({ msg: 'services are running and connected' });

    hubService.commLink.addHandler(
      'inbox', 'FieldExtractor:done~step',
      async () => {
        await hubService.commLink.broadcast('shutdown');
        await hubService.commLink.quit();
        done();
      }
    );

    const getResponse = await got('http://localhost:3100/extractor/batch.csv');

    prettyPrint({ response: getResponse.body });

    const retval = await got.post(
      'http://localhost:3100/extractor/fields.json', {
      json: sampleRecs
    });
    prettyPrint({ msg: "out of pipeline", response: retval.body });
  });
});
