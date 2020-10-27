import _ from 'lodash';

import { ServiceComm } from './service-comm';

import {
  Dispatch,
  Message,
  Yield
} from './service-defs';

export function chainServices<S, A>(
  functionName: string,
  serviceComms: ServiceComm<S>[]
): (a: A) => Promise<A> {
  const serviceNames = _.map(serviceComms, c => c.name);

  const callChainPromise = (a: A) => new Promise<A>((resolve) => {

    _.each(serviceComms, (commLink, n) => {
      const isLastService = n === serviceComms.length - 1;
      const isFirstService = n === 0;
      const nextService = serviceNames[n+1]
      const prevService = serviceNames[n-1]
      const currService = commLink.name;

      if (isFirstService) {
        commLink.addHandlerDefs([
          [`${currService}>push`, async function(msg) {
            if (msg.kind !== 'push') return;
            commLink.send(Message.address(msg.msg, { to: currService }));
          }],
        ]);
        commLink.addHandlerDefs([
          [`${nextService}>yield`, async function(msg) {
            if (msg.kind !== 'yield') return;
            resolve(msg.value);
          }],
        ]);
      }

      if (!isFirstService) {
        commLink.addHandlerDefs([
          [`${nextService}>yield`, async function(msg) {
            if (msg.kind !== 'yield') return;
            commLink.send(Message.address(msg, { to: prevService }));
          }],
        ]);
      }

      if (!isLastService) {
        commLink.addHandlerDefs([
          [`${currService}>yield`, async function(msg) {
            if (msg.kind !== 'yield') return;
            commLink.send(Message.address(Dispatch.create(functionName, msg.value), { to: nextService }));
          }],
        ]);
      }
      if (isLastService) {
        commLink.addHandlerDefs([
          [`${currService}>yield`, async function(msg) {
            if (msg.kind !== 'yield') return;
            commLink.send(Message.address(msg, { to: prevService }));
          }],
        ]);
      }
      commLink.addHandlerDefs([
        [`dispatch/${functionName}`, async function(msg) {
          if (msg.kind !== 'dispatch') return;
          const { func, arg } = msg;
          const f = commLink.dispatchHandlers[func];
          if (f !== undefined) {
            const bf = _.bind(f, this);
            const result = await bf(arg);
            const yld = result === undefined ? null : result;

            await commLink.send(
              Message.address(
                Yield.create(yld), { to: currService }
              )
            );
          }

        }],
      ]);

    });
    serviceComms[0].push(Yield.create(a));
  });
  return callChainPromise;
}
