import 'chai/register-should';
import { prettyPrint } from 'commons';

import _ from 'lodash';
import { chainServices } from './service-chain';
import { Address, Yield } from './service-defs';

import { createTestServices } from './service-test-utils';


describe('Redis-based Service Communication ', () => {
  process.env['service-comm.loglevel'] = 'info';

  interface MsgArg {
    callees: string[];
    which: number;
  }


  it('should push message and promise response', async (done) => {

    const testServices = await createTestServices(3);
    const commLinks = _.map(testServices, ts => ts.commLink);

    chainServices('run', commLinks);

    const commLink0 = commLinks[0];

    _.each(testServices, (service) => {
      service.commLink.addDispatches({
        async run(msg: MsgArg) {
          msg.callees.push(this.commLink.name);
          this.commLink.log.info(`run msg=${msg.which}, callees=${msg.callees}`);
          return msg;
        }
      });
    });


    const allChains = _.map(_.range(2), n => {
      const initMsg: MsgArg = {
        callees: [],
        which:n
      };

      return commLink0.yield(initMsg);
    });

    await Promise.all(allChains)
      .then((results) => {
        prettyPrint({ results });
      })


    const quitting = _.map(testServices, s => s.commLink.quit());
    await Promise.all(quitting);
    done();
  });

});
