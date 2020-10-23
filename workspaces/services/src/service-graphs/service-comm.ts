import _ from 'lodash';
import Redis from 'ioredis';
import Async from 'async';
import winston from 'winston';
import { getServiceLogger } from './service-logger';
import {
  Forward,
  HandlerInstance,
  HandlerSet,
  Message,
  Thunk,
} from './service-defs';
import { newRedis } from './ioredis-conn';


export interface ServiceComm<T> {
  name: string;
  serviceT?: T;
  log: winston.Logger;
  addHandler: (regex: string, handler: HandlerInstance<T>) => void;
  send(message: Message): Promise<void>;
  connect: (serviceT: T) => Promise<void>;
  quit: () => Promise<void>;

  // Internal use:
  subscriber: Redis.Redis;
  handlerSets: HandlerSet<T>[];
  isShutdown: boolean;
}


function getMessageHandlers<T>(
  message: Message,
  serviceComm: ServiceComm<T>,
  serviceT: T
): Thunk[] {
  const { handlerSets } = serviceComm;
  const { messageType } = message;

  const handlers = _.flatMap(handlerSets, (hs) => {
    return _.flatMap(_.toPairs(hs), ([handlerKey, handler]) => {
      const keyMatches = messageType.match(handlerKey)
      if (keyMatches) {
        const bh = _.bind(handler, serviceT);
        return [() => bh(message)];
      }
      return [];
    })
  });

  return handlers;
}


export function newServiceComm<T>(name: string): ServiceComm<T> {
  const serviceComm: ServiceComm<T> = {
    name,
    // serviceT,
    subscriber: newRedis(name),
    isShutdown: false,
    log: getServiceLogger(`${name}/comm`),
    handlerSets: [],
    async send(msg: Message): Promise<void> {
      if (this.isShutdown) return;
      const channel = msg.channel();
      const packedMsg = Message.pack(msg);

      const publisher = this.subscriber.duplicate();
      await publisher.publish(channel, packedMsg);
      await publisher.quit();
    },

    addHandler(regex: string, handler: HandlerInstance<T>): void {
      const handlerSet: HandlerSet<T> = {};
      handlerSet[regex] = handler;
      this.handlerSets.push(handlerSet);
    },

    async connect(serviceT: T): Promise<void> {
      const self = this;
      self.serviceT = serviceT;

      return new Promise((resolve, reject) => {
        const subscriber = self.subscriber;

        subscriber.on('message', (channel: string, packedMsg: string) => {
          const message = Message.unpack(packedMsg);

          const handlersForMessage = getMessageHandlers<T>(message, serviceComm, serviceT);

          const haveHandlers = handlersForMessage.length > 0;

          const respondIfHandled = async () => {
            if (haveHandlers) {
              const forwardLocal = Message.create({
                from: name,
                to: name,
                messageType: 'handled',
              }, Forward.create(message))
              return serviceComm.send(forwardLocal);
            }
          };

          const rcvd = Message.create({
            from: name,
            to: name,
            messageType: 'received',
          }, Forward.create(message))

          // TODO message payload type Dispatch?
          serviceComm.send(rcvd)
            .then(() => Async.mapSeries(handlersForMessage, async (handler) => handler()))
            .then(respondIfHandled)
            .catch((err) => {
              serviceComm.log.warn(`> ${packedMsg} on ${channel}: ${err}`)
            });
        });

        subscriber.on('ready', () => {
          subscriber.subscribe(`${name}`)
            .then(() => resolve())
            .catch((err) => {
              serviceComm.log.error(`subscribe> ${err}`)
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
//         const handlerSet: HandlerSet<T> = {};
//         handlerSet[regex] = handler;
//         this.handlerSets.push(handlerSet);
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

