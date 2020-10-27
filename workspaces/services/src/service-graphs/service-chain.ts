import _ from 'lodash';

import { ServiceComm } from './service-comm';
import { newIdGenerator, prettyPrint } from 'commons';

import {
  Address,
  Dispatch,
  Yield
} from './service-defs';

const nextId = newIdGenerator(1);

export function chainServices<S, A>(
  functionName: string,
  serviceComms: ServiceComm<S>[]
): (a: A) => Promise<A> {
  const serviceNames = _.map(serviceComms, c => c.name);

  _.each(serviceComms, (commLink, n) => {
    const isLastService = n === serviceComms.length - 1;
    const isFirstService = n === 0;
    const nextService = serviceNames[n + 1]
    const prevService = serviceNames[n - 1]
    const currService = commLink.name;

    if (isFirstService) {
      commLink.addHandlerDefs([
        [`${currService}>push`, async function(msg) {
          if (msg.kind !== 'push') return;
          commLink.send(Address(msg.msg, { id: msg.id, to: currService }));
        }],
      ]);
    }

    if (!isFirstService) {
      commLink.addHandlerDefs([
        [`${nextService}>yield`, async function(msg) {
          if (msg.kind !== 'yield') return;
          commLink.send(Address(msg, { to: prevService }));
        }],
      ]);
    }

    if (!isLastService) {
      commLink.addHandlerDefs([
        [`${currService}>yield`, async function(msg) {
          if (msg.kind !== 'yield') return;
          commLink.send(Address(Dispatch(functionName, msg.value), { id: msg.id, to: nextService }));
        }],
      ]);
    }
    if (isLastService) {
      commLink.addHandlerDefs([
        [`${currService}>yield`, async function(msg) {
          if (msg.kind !== 'yield') return;
          commLink.send(Address(msg, { to: prevService }));
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
            Address(
              Yield(yld), { id: msg.id, to: currService }
            )
          );
        }
      }],
    ]);
  });

  const callChainPromise = (a: A) => {
    const id = nextId();

    const toYield = Address(Yield(a), { id });
    // prettyPrint({ toYield })

    const promise = new Promise<A>((resolve) => {
      _.each(serviceComms, (commLink, n) => {
        const isFirstService = n === 0;
        const nextService = serviceNames[n + 1]
        if (isFirstService) {
          commLink.addHandlerDefs([
            [`${id}:.*:${nextService}>yield`, async function(msg) {
              if (msg.kind !== 'yield') return;
              // prettyPrint({ sdf: 'resolving', msg, id })
              resolve(msg.value);
            }],
          ]);
        }
      });
    });
    serviceComms[0].push(toYield);
    return promise;
  };

  return callChainPromise;
}
