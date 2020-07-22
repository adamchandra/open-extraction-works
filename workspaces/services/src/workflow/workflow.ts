import _ from "lodash";

import Redis from 'ioredis';

import * as Task from 'fp-ts/lib/Task';
import * as Arr from 'fp-ts/lib/Array';
const sequenceArrOfTask = Arr.array.sequence(Task.task);

import { putStrLn } from 'commons';

type HandlerInstance = (msg: string) => Promise<void>
type HandlerSet = Record<string, HandlerInstance>

interface HandlerSets {
  'inbox': HandlerSet[];
  'local': HandlerSet[];
  'broadcast': HandlerSet[];
}

type HandlerScope = keyof HandlerSets;

export interface NamedRedisPool {
  name: string;
  addHandlers: (scope: HandlerScope, hs: HandlerSet) => void;
  sendTo(name: string, msg: string): Promise<void>;
  broadcast(msg: string): Promise<void>;
  quit: () => Promise<void>;
}


export interface WithPubSub {
  subscriber: Redis.Redis;
  handlerSets: HandlerSets;
  isShutdown: boolean;
  send(name: string, scope: HandlerScope, msg: string): Promise<void>;
}

export function newRedis(name: string, opts?: Redis.RedisOptions): Redis.Redis {
  const isDockerized = process.env['DOCKERIZED'] === 'true';
  const host = isDockerized ? 'redis' : 'localhost';
  const allOpts = _.merge({}, { host }, opts);
  putStrLn(`Connecting to host:${host}`);
  const client = new Redis(allOpts);
  installConnectionHandlers(client, name);
  return client;
}

export function createRedisPool(name: string): Promise<NamedRedisPool & WithPubSub> {

  return new Promise((resolve) => {
    const subscriber = newRedis(name);

    const namedPool: NamedRedisPool & WithPubSub = {
      name,
      subscriber,
      isShutdown: false,
      handlerSets: {
        'inbox': [],
        'local': [],
        'broadcast': []
      },
      async send(recipient: string, scope: HandlerScope, msg: string): Promise<void> {
        if (this.isShutdown) return;

        const publisher = this.subscriber.duplicate();
        await publisher.publish(`${recipient}.${scope}`, msg);
        putStrLn(`${name} [sent:${scope}]> #${msg} -[to]-> ${recipient}`);
        await publisher.quit();
      },
      async sendTo(recipient: string, msg: string): Promise<void> {
        const prefixedMsg = `${name}:${msg}`;
        return this.send(recipient, 'inbox', prefixedMsg);
      },
      async broadcast(msg: string): Promise<void> {
        return this.send(name, 'broadcast', msg);
      },
      addHandlers(scope: HandlerScope, hs: HandlerSet): void {
        this.handlerSets[scope].push(hs);
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

    subscriber.on('message', (channel: string, msg: string) => {
      const channelParts = channel.split(/\./);
      const channelScope = _.last(channelParts);
      if (channelScope === undefined) {
        return;
      }

      const scopedHandlers =
        channelScope === 'inbox' ?
          namedPool.handlerSets.inbox :
          channelScope === 'local' ?
            namedPool.handlerSets.local :
            channelScope === 'broadcast' ?
              namedPool.handlerSets.broadcast : undefined;

      if (scopedHandlers === undefined) {
        putStrLn(`Error: Received unknown scoped message ${msg} on ${channel}`);
        return;
      }

      const handlersForMessage = _.flatMap(scopedHandlers, (hs) => {
        return _.flatMap(_.toPairs(hs), ([k, v]) => {
          const keyMatches = msg.match(k)
          if (keyMatches) {
            return [() => v(msg)];
          }
          return [];
        })
      });

      const isLocalMessage = channelScope === 'local';
      if (isLocalMessage) {
        sequenceArrOfTask(handlersForMessage)()
          .catch((err) => {
            putStrLn(`${name} [ERROR]> ${msg} on ${channel}: ${err}`);
          });
        return;
      }

      namedPool.send(name, 'local', `received::${channel}::${msg}`)
        .then(() => sequenceArrOfTask(handlersForMessage)())
        .then(() => {
          return namedPool.send(name, 'local', `handled::${channel}::${msg}`)
        })
        .catch((err) => {
          putStrLn(`${name} [WARN]> ${msg} on ${channel}: ${err}`);
        });
    });

    subscriber.on('ready', () => {
      subscriber.subscribe(`${name}.inbox`)
      subscriber.subscribe(`${name}.local`)
        .then(() => resolve(namedPool));
    });
  });
}


export async function getSatelliteRedisPool(name: string): Promise<NamedRedisPool> {
  const initPool = await createRedisPool(name);
  initPool.subscriber.subscribe(`hub.broadcast`);
  initPool.addHandlers('inbox', {
    '.*': async (msg: string) => {
      putStrLn(`${name}> got inbox message ${msg}`);
    },
  });

  initPool.addHandlers('local', {
    '.*': async (msg: string) => {
      const [localMessage, originalChannel, originalMsg] = msg.split(/::/);
      const [, originalScope] = originalChannel.split(/\./);

      putStrLn(`${name} [${localMessage}]> #${originalMsg} <-[from]- ${originalChannel}`);

      if (originalScope === 'inbox') {
        switch (localMessage) {
          case 'received':
            return initPool.send('hub', 'inbox', 'ack')
          case 'handled':
            return initPool.send('hub', 'inbox', 'done')
          default:
            putStrLn(`${name} [unhandled]> #${msg}`);
        }
      }
    },
  });
  initPool.addHandlers('broadcast', {
    'shutdown': async () => {
      return initPool.quit();
    },
  });
  return initPool;
}

export async function getHubRedisPool(name: string): Promise<NamedRedisPool> {
  const initPool = await createRedisPool(name);
  return initPool;
}

function installConnectionHandlers(r: Redis.Redis, name: string) {
  const events = [
    'ready',
    'close',
    'end',
    'error',
    'connect',
    'reconnecting'
  ];
  _.each(
    events, (eventName: string) => {
      r.on(eventName, () => {
        putStrLn(`${name} [${eventName}]>`);
      });
    }
  );
}

















// subscriber.on('ready', () => {
//   // TODO handle hub:shutdown w/ this.quit()
//   subscriber.subscribe(`${name}.inbox`)
//     .then(() => subscriber.subscribe(`hub.broadcast`))
//     .then(() => resolve(namedPool));
// });
// export function clientOnMessage(
//   receiverName: string,
//   handlers: Record<string, () => Promise<void>>,
// ): (channel: string, msg: string) => Promise<void> {

//   return async (channel: string, msg: string) => {
//     putStrLn(`${receiverName} [rcvd]> ${msg}  (on channel ${channel})`);
//     const [, suffix] = msg.split(':');
//     let handler = handlers[msg];
//     if (handler === undefined && suffix !== undefined) {
//       handler = handlers[suffix]
//     }

//     if (handler === undefined) {
//       putStrLn(`${receiverName} [drop]> ${msg}`);
//       return;
//     }
//     return handler()
//       .then(() => putStrLn(`${receiverName} [handled]> ${msg}`))
//       .catch((err) => putStrLn(`${receiverName} [err]> ${err}`))
//       ;
//   }
// }

// export async function handleMessages(
//   receiverName: string,
//   receiverClient: Redis.Redis,
//   _publishClient: Redis.Redis,
//   handlers: Record<string, () => Promise<void>>
// ): Promise<void> {
//   const handleOnMessage = clientOnMessage(receiverName, handlers);
//   receiverClient.on('message', handleOnMessage);
//   // await receiverClient.subscribe(messageChannel);
// }

// export async function handleMessagesThenSendDone(
//   receiverName: string,
//   receiverClient: Redis.Redis,
//   publishClient: Redis.Redis,
//   handlers: Record<string, () => Promise<void>>
// ): Promise<void> {
//   const handleOnMessage = clientOnMessage(receiverName, handlers);

//   receiverClient.on('message', (channel: string, msg: string) => {
//     handleOnMessage(channel, msg)
//       .then(() => sendPrefixedMsg(receiverName, publishClient, 'hub', 'done'))
//       .catch((err) => putStrLn(`${receiverName} [err]> ${err}`))
//   });
//   // await receiverClient.subscribe(messageChannel);
// }

// putStrLn(`${name} [err]> ${err}`);
// .then(() => sendPrefixedMsg(name, publisher, 'hub', 'done'))
