import 'chai/register-should';

import _ from 'lodash';
import { Forward, Message, MEvent } from './service-defs';
import { prettyPrint } from 'commons';

describe('Service Communication Hub lifecycle', () => {
  process.env['service-comm.loglevel'] = 'warn';

  it.only('should marshall/unmarshall messages', () => {
    const msg = Message.create({
      from: 'me', to: 'you', messageType: 'ping'
    }, MEvent.create('Hey There!'))

    const packedMsg = Message.pack(msg);

    const forwarded = Message.create({
      from: 'Apple', to: 'Banana', messageType: 'received'
    }, Forward.create(msg));

    const packedForward = Message.pack(forwarded);
    prettyPrint({ msg, packedMsg, forwarded, packedForward });

    const unpackedForward = Message.unpack(packedForward);
    const unpackedMsg = Message.unpack(packedMsg);

    prettyPrint({ unpackedMsg, unpackedForward });


    // const examples = [
    //   'localmsg::recv#channel.scope#channel::qmsg#sender:qmsg:message',
    //   // Ask Hub to echo 'run' message to my inbox
    //   'echo::my-service.inbox::my-service:run',



    // ];

    // _.each(examples, example => {
    //   const unpackedMessage = unpackLocalMessage(example);
    //   prettyPrint({ unpackedMessage })
    // });
  });


});
