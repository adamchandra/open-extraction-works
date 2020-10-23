import _ from 'lodash';
import Redis from 'ioredis';
import Async from 'async';
import winston from 'winston';
import { getServiceLogger } from './service-logger';
import {
  MessageHandlers,
  DispatchHandlers,
  Message,
  Thunk,
  Yield,
} from './service-defs';

import { newRedis } from './ioredis-conn';

import { prettyPrint } from 'commons';

import { parseJSON, isLeft, toError } from 'fp-ts/lib/Either';

function parseJson(s: string): any | undefined {
  const parsed = parseJSON(s, toError);

  if (isLeft(parsed)) {
    const syntaxError = parsed.left;
    const posRE = /position (\d+)/;
    const posMatch = syntaxError.message.match(posRE);

    if (posMatch && posMatch.length > 1) {
      const errIndex = parseInt(posMatch[1]);
      const begin = Math.max(0, errIndex - 50);
      const end = Math.min(s.length, errIndex + 50);
      const pre = s.slice(begin, errIndex + 1)
      const post = s.slice(errIndex + 1, end)
      console.log(`${syntaxError}\nContext:\n${pre} <-- Error\n${post}`);
    }
    return;
  }
  return parsed.right;
}

export interface ServiceComm<T> {
  name: string;
  serviceT?: T;
  log: winston.Logger;
  // addHandler(regex: string, handler: MessageHandler<T>): void;
  addHandlers(m: MessageHandlers<T>): void;
  addDispatches(d: DispatchHandlers<T>): void;
  send(message: Message): Promise<void>;
  connect(serviceT: T): Promise<void>;
  quit(): Promise<void>;

  // Internal use:
  subscriber: Redis.Redis;
  messageHandlers: MessageHandlers<T>;
  dispatchHandlers: DispatchHandlers<T>;
  isShutdown: boolean;
}


function getMessageHandlers<T>(
  message: Message,
  serviceComm: ServiceComm<T>,
  serviceT: T
): Thunk[] {
  const { messageHandlers } = serviceComm;
  const { messageType } = message;

  const handlers = _.flatMap(
    _.toPairs(messageHandlers), ([handlerKey, handler]) => {
      const keyMatches = messageType === handlerKey;
      if (keyMatches) {
        const bh = _.bind(handler, serviceT);
        return [() => bh(message)];
      }
      return [];
    });

  return handlers;
}

export function newServiceComm<T>(name: string): ServiceComm<T> {

  const serviceComm: ServiceComm<T> = {
    name,
    subscriber: newRedis(name),
    isShutdown: false,
    log: getServiceLogger(`${name}/comm`),
    messageHandlers: {},
    dispatchHandlers: {},
    async send(msg: Message): Promise<void> {
      if (this.isShutdown) return;
      const channel = msg.channel();
      const packedMsg = Message.pack(msg);

      const publisher = this.subscriber.duplicate();
      await publisher.publish(channel, packedMsg);
      await publisher.quit();
    },

    addDispatches(dispatches: DispatchHandlers<T>): void {
      const all = {
        ...this.dispatchHandlers,
        ...dispatches,
      }
      this.dispatchHandlers = all;
    },
    addHandlers(messageHandlers: MessageHandlers<T>): void {
      const all = {
        ...this.messageHandlers,
        ...messageHandlers,
      }
      this.messageHandlers = all;
    },

    async connect(serviceT: T): Promise<void> {
      const self = this;
      self.serviceT = serviceT;

      return new Promise((resolve, reject) => {
        const subscriber = self.subscriber;
        const log = self.log;

        subscriber.on('message', (channel: string, packedMsg: string) => {
          log.verbose(`${name} received> ${packedMsg}`);

          const message = Message.unpack(packedMsg);

          const handlersForMessage = getMessageHandlers<T>(message, serviceComm, serviceT);


          Async.mapSeries(handlersForMessage, async (handler) => handler())
            .catch((err) => {
              log.warn(`> ${packedMsg} on ${channel}: ${err}`)
            });
        });

        subscriber.on('ready', () => {
          subscriber.subscribe(`${name}`)
            .then(() => log.info(`${name}> connected`))
            .then(() => resolve())
            .catch((err) => {
              log.error(`subscribe> ${err}`)
              reject(`${name} subscribe> ${err}`)
            });
        });
      });
    },
    async quit(): Promise<void> {
      const self = this;
      return new Promise((resolve) => {
        self.subscriber.on('end', () => resolve())
        self.isShutdown = true;
        self.subscriber.quit();
      });
    }
  };

  serviceComm.addHandlers({
    async dispatch(msg) {
      prettyPrint({ p: 'dispatching', msg });
      const { from, to, payload } = msg;
      if (payload.kind === 'dispatch') {
        const { func, arg } = payload;
        const f = serviceComm.dispatchHandlers[func];
        if (f !== undefined) {
          const argz = parseJson(arg);
          const bf = _.bind(f, this);
          const result = await bf(argz);
          prettyPrint({ p: 'dispatched', arg, result });

          const response = Message.create({
            from: to, to: from, messageType: 'yield'
          }, Yield.create(result));

          await serviceComm.send(response);
        }
      }
    }
  });

  return serviceComm;
}




// export function createServiceComm<T>(name: string, serviceT: T): Promise<ServiceComm<T>> {

//   return new Promise((resolve, reject) => {
//     const subscriber = newRedis(name);

//     const serviceComm: ServiceComm<T> = {
//       name,
//       // serviceT,
//       subscriber,
//       isShutdown: false,
//       log: getServiceLogger(`${name}/comm`),
//       handlerSets: [],
//       async send(msg: Message): Promise<void> {
//         if (this.isShutdown) return;
//         const channel = msg.channel();
//         const packedMsg = Message.pack(msg);

//         const publisher = this.subscriber.duplicate();
//         await publisher.publish(channel, packedMsg);
//         await publisher.quit();
//       },

//       addHandler(regex: string, handler: HandlerInstance<T>): void {
//         const messageHandlers: HandlerSet<T> = {};
//         messageHandlers[regex] = handler;
//         this.handlerSets.push(messageHandlers);
//       },
//       async quit(): Promise<void> {
//         const self = this;
//         return new Promise((resolve) => {
//           self.subscriber.on('end', () => resolve())
//           self.isShutdown = true;
//           self.subscriber.quit();
//         });
//       }
//     };

//     subscriber.on('message', (channel: string, packedMsg: string) => {
//       const message = Message.unpack(packedMsg);

//       const handlersForMessage = getMessageHandlers<T>(message, serviceComm, serviceT);

//       const haveHandlers = handlersForMessage.length > 0;

//       const respondIfHandled = async () => {
//         if (haveHandlers) {
//           const forwardLocal = Message.create({
//             from: name,
//             to: name,
//             messageType: 'handled',
//           }, Forward.create(message))
//           return serviceComm.send(forwardLocal);
//         }
//       };

//       const rcvd = Message.create({
//         from: name,
//         to: name,
//         messageType: 'received',
//       }, Forward.create(message))

//       // TODO message payload type Dispatch?
//       serviceComm.send(rcvd)
//         .then(() => Async.mapSeries(handlersForMessage, async (handler) => handler()))
//         .then(respondIfHandled)
//         .catch((err) => {
//           serviceComm.log.warn(`> ${packedMsg} on ${channel}: ${err}`)
//         });
//     });

//     subscriber.on('ready', () => {
//       subscriber.subscribe(`${name}`)
//         .then(() => resolve(serviceComm))
//         .catch((err) => {
//           serviceComm.log.error(`subscribe> ${err}`)
//           reject(`${name} subscribe> ${err}`)
//         });
//     });
//   });
// }


// const haveHandlers = handlersForMessage.length > 0;

// const respondIfHandled = async () => {
//   if (haveHandlers) {
//     const forwardLocal = Message.create({
//       from: name,
//       to: name,
//       messageType: 'handled',
//     }, Forward.create(message))
//     return serviceComm.send(forwardLocal);
//   }
// };

// const rcvd = Message.create({
//   from: name,
//   to: name,
//   messageType: 'received',
// }, Forward.create(message))

// serviceComm.send(rcvd)
//   .then(() => Async.mapSeries(handlersForMessage, async (handler) => handler()))
//   .then(respondIfHandled)
//   .catch((err) => {
//     log.warn(`> ${packedMsg} on ${channel}: ${err}`)
//   });
