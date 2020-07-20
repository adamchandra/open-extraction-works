import _ from "lodash";

import Redis from 'ioredis';

import { putStrLn } from 'commons';

type HandlerInstance = () => Promise<void>
type HandlerSet = Record<string, HandlerInstance>

export interface NamedRedisPool {
  name: string;
  handleInbox: (hs: HandlerSet) => Promise<void>;
  handleBroadcasts: (hs: HandlerSet) => Promise<void>;
  sendTo(name: string, msg: string): Promise<void>;
  broadcast(msg: string): Promise<void>;
  quit: () => Promise<void>;
}

export interface WithPubSub {
  publisher: Redis.Redis;
  subscriber: Redis.Redis;
}

export function newRedis(name: string, opts?: Redis.RedisOptions): Redis.Redis {
  const isDockerized = process.env['DOCKERIZED'] === 'true';
  const host = isDockerized ? 'redis' : 'localhost';
  const allOpts = _.merge({}, { host }, opts);
  putStrLn(`redis using opts`, allOpts);
  const client = new Redis(allOpts);
  installConnectionHandlers(client, name);
  return client;
}

export function sendPrefixedMsg(
  senderName: string,
  senderClient: Redis.Redis,
  recipientName: string,
  msg: string,
): Promise<number> {
  const prefixedMsg = `${senderName}:${msg}`;
  putStrLn(`${senderName} [sent]> #${msg} -[to]-> @${recipientName}`);
  return senderClient.publish(`${recipientName}.inbox`, prefixedMsg);
}


export function getSatelliteRedisPool(name: string): Promise<NamedRedisPool> {

  return new Promise((resolve) => {
    const publisher = newRedis(name);
    const subscriber = publisher.duplicate();
    const namedPool: NamedRedisPool & WithPubSub = {
      name,
      publisher,
      subscriber,
      async sendTo(recipient: string, msg: string): Promise<void> {
        await sendPrefixedMsg(name, this.publisher, recipient, msg);
      },
      async broadcast(msg: string): Promise<void> {
        putStrLn(`${name} [broadcast]> #${msg}`);
        await this.publisher.publish(`${name}.broadcast`, msg);
      },
      async handleInbox(hs: HandlerSet) {
        const client = this.subscriber;
        return handleMessagesThenSendDone(name, client, publisher, `${name}.inbox`, hs);
      },
      async handleBroadcasts(hs: HandlerSet) {
        const client = this.subscriber;
        await client.subscribe('hub.broadcast');
        return handleMessagesThenSendDone(name, client, publisher, 'hub.broadcast', hs)
      },
      async quit(): Promise<void> {
        return Promise
          .all([
            this.publisher.quit(),
            this.subscriber.quit(),
          ]).then(() => undefined);
      }
    };
    subscriber.on('ready', () => {
      handleMessagesThenSendDone(
        name,
        subscriber,
        publisher,
        'hub.broadcast', {
        'hub:shutdown': async () => namedPool.quit(),
      })
        .then(() => resolve(namedPool));
    });
  });
}
export function getHubRedisPool(name: string): Promise<NamedRedisPool> {

  return new Promise((resolve) => {
    const publisher = newRedis(name);
    const subscriber = publisher.duplicate();
    const namedPool: NamedRedisPool & WithPubSub = {
      name,
      publisher,
      subscriber,
      async sendTo(recipient: string, msg: string): Promise<void> {
        await sendPrefixedMsg(name, this.publisher, recipient, msg);
      },
      async broadcast(msg: string): Promise<void> {
        putStrLn(`${name} [broadcast]> #${msg}`);
        await this.publisher.publish(`${name}.broadcast`, msg);
      },
      async handleInbox(hs: HandlerSet) {
        const client = this.subscriber;
        return handleMessages(name, client, publisher, `${name}.inbox`, hs);
      },
      async handleBroadcasts(_hs: HandlerSet) {
        return;
      },
      async quit(): Promise<void> {
        return Promise
          .all([
            this.publisher.quit(),
            this.subscriber.quit(),
          ]).then(() => undefined);
      }
    };
    subscriber.on('ready', () => {
      resolve(namedPool);
    });
  });
}

export function clientOnMessage(
  receiverName: string,
  messageChannel: string,
  handlers: Record<string, () => Promise<void>>,
): (channel: string, msg: string) => Promise<void> {

  return async (channel: string, msg: string) => {
    if (channel !== messageChannel) {
      return;
    }
    putStrLn(`${receiverName} [rcvd]> ${msg}`);
    const [, suffix] = msg.split(':');
    let handler = handlers[msg];
    if (handler === undefined && suffix !== undefined) {
      handler = handlers[suffix]
    }

    if (handler === undefined) {
      putStrLn(`${receiverName} [drop]> ${msg}`);
      return;
    }
    return handler()
      .then(() => putStrLn(`${receiverName} [handled]> ${msg}`))
      .catch((err) => putStrLn(`${receiverName} [err]> ${err}`))
      ;
  }
}

export async function handleMessages(
  receiverName: string,
  receiverClient: Redis.Redis,
  _publishClient: Redis.Redis,
  messageChannel: string,
  handlers: Record<string, () => Promise<void>>
): Promise<void> {
  const handleOnMessage = clientOnMessage(receiverName, messageChannel, handlers);
  receiverClient.on('message', handleOnMessage);
  await receiverClient.subscribe(messageChannel);
}

export async function handleMessagesThenSendDone(
  receiverName: string,
  receiverClient: Redis.Redis,
  publishClient: Redis.Redis,
  messageChannel: string,
  handlers: Record<string, () => Promise<void>>
): Promise<void> {
  const handleOnMessage = clientOnMessage(receiverName, messageChannel, handlers);

  receiverClient.on('message', (channel: string, msg: string) => {
    handleOnMessage(channel, msg)
      .then(() => sendPrefixedMsg(receiverName, publishClient, 'hub', 'done'))
      .catch((err) => putStrLn(`${receiverName} [err]> ${err}`))
  });

  await receiverClient.subscribe(messageChannel);
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
