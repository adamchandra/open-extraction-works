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
  Push,
  MessageHandlerDef,
  MessageBody,
} from './service-defs';

import { newRedis } from './ioredis-conn';

export interface ServiceComm<T> {
  name: string;
  log: winston.Logger;
  addHandlers(m: MessageHandlers<T>): void;
  addHandlerDefs(m: MessageHandlerDef<T>[]): void;
  addDispatches(d: DispatchHandlers<T>): void;
  send(message: Message): Promise<void>;
  push(message: MessageBody): Promise<void>;
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
  packedMsg: string,
  serviceComm: ServiceComm<T>,
  serviceT: T
): Thunk[] {
  const { messageHandlers } = serviceComm;

  // const pmsg = packMessage(message);
  serviceComm.log.silly(`finding message handlers for ${packedMsg}`);
  const handlers = _.flatMap(
    _.toPairs(messageHandlers), ([handlerKey, handler]) => {
      const keyMatches = packedMsg.match(handlerKey);
      if (keyMatches !== null) {
        serviceComm.log.silly(`found message handler ${handlerKey} for ${packedMsg}`);
        const bh = _.bind(handler, serviceT);
        return [() => bh(message)];
      }
      return [];
    });

  return handlers;
}

export function newServiceComm<This>(name: string): ServiceComm<This> {

  const serviceComm: ServiceComm<This> = {
    name,
    subscriber: newRedis(name),
    isShutdown: false,
    log: getServiceLogger(`${name}/comm`),
    messageHandlers: {},
    dispatchHandlers: {},
    async push(msg: MessageBody): Promise<void> {
      this.send(
        Message.address(
          Push.create(msg), { from: name, to: name }
        )
      );
    },
    async send(msg: Message): Promise<void> {
      const addr = Message.address(
        msg, { from: name }
      )
      const packedMsg = Message.pack(addr);

      if (this.isShutdown) {
        this.log.warn(`${name}> shutdown; not sending message ${packedMsg}`);
        return;
      }
      const { to } = msg;

      const publisher = this.subscriber.duplicate();
      await publisher.publish(to, packedMsg);
      this.log.verbose(`publishing ${packedMsg}`);
      await publisher.quit();
    },

    addDispatches(dispatches: DispatchHandlers<This>): void {
      const all = {
        ...this.dispatchHandlers,
        ...dispatches,
      }
      this.dispatchHandlers = all;
    },
    addHandlers(messageHandlers: MessageHandlers<This>): void {
      const all = {
        ...this.messageHandlers,
        ...messageHandlers,
      }
      this.messageHandlers = all;
    },

    addHandlerDefs(handlerDefs: MessageHandlerDef<This>[]): void {
      _.each(handlerDefs, ([handlerKey, handler]) => {
        this.messageHandlers[handlerKey] = handler;
      });
    },

    async connect(serviceT: This): Promise<void> {
      const self = this;

      return new Promise((resolve, reject) => {
        const subscriber = self.subscriber;
        const log = self.log;

        subscriber.on('message', (channel: string, packedMsg: string) => {
          log.verbose(`${name} received> ${packedMsg}`);

          const message = Message.unpack(packedMsg);

          const handlersForMessage = getMessageHandlers<This>(message, packedMsg, serviceComm, serviceT);

          Async.mapSeries(handlersForMessage, async (handler) => handler())
            .catch((err) => {
              log.warn(`> ${packedMsg} on ${channel}: ${err}`)
            });
        });

        // subscriber.on('ready', () => {
        subscriber.subscribe(`${name}`)
          .then(() => log.info(`${name}> connected`))
          .then(() => resolve())
          .catch((err) => {
            log.error(`subscribe> ${err}`)
            reject(`${name} subscribe> ${err}`)
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
      if (msg.kind === 'dispatch') {
        const { func, arg } = msg;
        const f = serviceComm.dispatchHandlers[func];
        if (f !== undefined) {
          const bf = _.bind(f, this);
          const result = await bf(arg);
          const yld = result === undefined ? null : result;

          await serviceComm.send(
            Message.address(
              Yield.create(yld), { to: msg.from }
            )
          );
        }
      }
    }
  });

  return serviceComm;
}
