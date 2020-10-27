import 'chai/register-should';

import _ from 'lodash';
import { Ack, Dispatch, Message, Ping, Quit, Yield } from './service-defs';
import { prettyPrint } from 'commons';

describe('Service Communication Hub lifecycle', () => {
  process.env['service-comm.loglevel'] = 'warn';

  it.only('should marshall/unmarshall messages', () => {
    const examples = [
      Yield.create({ someVal: '23' }),
      Dispatch.create('my-method', { arg: 0, arg2: '1' }),
      Ping,
      Ack.create(Ping),
      Quit
    ];

    _.each(examples, example => {
      const addressed = Message.address(example, {})
      const packedMsg = Message.pack(addressed);
      const unpackedMsg = Message.unpack(packedMsg);

      prettyPrint({ packedMsg, unpackedMsg });
    });



  });


});
