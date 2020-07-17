import _ from "lodash";

import Redis from 'ioredis';

import { putStrLn } from 'commons';



type HandlerInstance = () => Promise<void>
type HandlerSet = Record<string, HandlerInstance>

export interface NamedRedisPool {
  name: string;
  // newRedis: () => Redis.Redis;
  // _getInternalPublisher(): Redis.Redis;
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
  const client = new Redis(opts || {});
  onConnHandlers(client, name);
  return client;
}

export function getNamedRedisPool(name: string): Promise<NamedRedisPool> {

  return new Promise((resolve) => {
    const publisher = newRedis(name);
    const subscriber = publisher.duplicate();
    const namedPool: NamedRedisPool & WithPubSub = {
      name,
      publisher,
      subscriber,
      async sendTo(recipient: string, msg: string): Promise<void> {
        const prefixedMsg = `${name}:${msg}`;
        await this.publisher.publish(`${recipient}.inbox`, prefixedMsg);
      },
      async broadcast(msg: string): Promise<void> {
        // const prefixedMsg = `${name}:${msg}`;
        await this.publisher.publish(`${name}.broadcast`, msg);
      },
      async handleInbox(hs: HandlerSet) {
        const client = this.subscriber;
        return handleMessages(name, client, `${name}.inbox`, hs);
      },
      async handleBroadcasts(hs: HandlerSet) {
        const client = this.subscriber;
        await client.subscribe('hub.broadcast');
        return handleMessages(name, client, 'hub.broadcast', hs);
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

export async function handleMessages(
  receiverName: string,
  client: Redis.Redis,
  messageChannel: string,
  handlers: Record<string, () => Promise<void>>
): Promise<void> {

  client.on('message', (channel: string, msg: string) => {
    putStrLn(`Message to ${receiverName} on ${channel}  ==>  ${msg}`);
    if (channel !== messageChannel) {
      putStrLn(`Discarding (wrong channel) Message to ${receiverName} on ${channel}  ==>  ${msg}`);
      return;
    }
    const [, suffix] = msg.split(':');
    let handler = handlers[msg];
    if (handler === undefined && suffix !== undefined) {
      handler = handlers[suffix]
    }
    if (handler === undefined) {
      putStrLn(`Discarding (no handler) Message to ${receiverName} on ${channel}  ==>  ${msg}`);
    }

    return handler().then(() => {
      putStrLn(`Handled Message to ${receiverName} on ${channel}  ==>  ${msg}`);
    });

  });
  await client.subscribe(messageChannel);
}


export function printDiscardedChannelMessage(name: string, channel: string, msg: string) {
  putStrLn(`Discarding Message to ${name} on ${channel}  ==>  ${msg}`);
}
export function printChannelMessage(name: string, channel: string, msg: string) {
  putStrLn(`Message to ${name} on ${channel}  ==>  ${msg}`);
}

export function onConnHandlers(r: Redis.Redis, name: string) {
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
        putStrLn(`Client (${name}):  ${eventName}`);
      });
    }
  );
}


export function getHubConn(rclient: Redis.Redis, name: string): (msg: string) => Promise<number> {
  return (msg: string) => {
    return rclient.publish(`hub.inbox.${name}`, msg);
  };
}


type ServiceType = Promise<void>;
type CloseCallback = () => void;
type ServiceReturnT = Promise<[ServiceType, CloseCallback]>;

export async function createHubService(): ServiceReturnT {
  const hubPub = new Redis();

  const closeService = () => {
    // make sure our satellites are shutdown
    // then: resolve

  };

  // await hubSub.subscribe("portal.events");
  const serviceP = new Promise<void>((resolve) => {
    Promise.all([
      hubPub.quit(),
      // hubSub.quit(),
    ]).then(() => resolve());
  });
  return [serviceP, closeService];
}

export async function createSatelliteService(): ServiceReturnT {
  const satService = new Redis();
  const hubSub = satService.duplicate();
  await hubSub.subscribe('hub.events');
  const closeService = async () => {
    // await satPub.quit()
    await hubSub.quit()
  };

  const serviceP = new Promise<void>((resolve) => {

    // const satPub = new Redis();


    hubSub.on('message', (channel: string, msg) => {
      if (channel !== 'hub.events') return;
      switch (msg) {
        case 'shutdown': {
          break;
        }
      }
    });


    resolve();
  });
  return [serviceP, closeService];
}

// export async function createRestPortalService(): ServiceReturnT {
// export async function createSpiderService(): Promise<void> {}
// export async function createFieldExtractionService(): Promise<void> {}

// newRedis() {
//   const client = newRedis(name);
//   this.pool[name] = client;
//   return client;
// },
// _getInternalPublisher(): Redis.Redis {
//   let publishClient: Redis.Redis = this.pool['_publisher'];

//   if (!publishClient) {
//     this.pool['_publisher'] = publishClient = new Redis();
//   }
//   return publishClient;
// },
