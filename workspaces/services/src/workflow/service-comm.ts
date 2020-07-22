import _ from "lodash";
import { putStrLn } from 'commons';
import Redis from 'ioredis';
import * as Task from 'fp-ts/lib/Task';
import * as Arr from 'fp-ts/lib/Array';

const RedisConnectionEvents = [
  'ready',
  'close',
  'end',
  'error',
  'connect',
  'reconnecting'
];

type HandlerInstance = (msg: string) => Promise<void>
type HandlerSet = Record<string, HandlerInstance>

interface HandlerSets {
  'inbox': HandlerSet[];
  'local': HandlerSet[];
  'broadcast': HandlerSet[];
}

type HandlerScope = keyof HandlerSets;

export interface ServiceComm {
  name: string;
  addHandlers: (scope: HandlerScope, hs: HandlerSet) => void;
  sendTo(name: string, msg: string): Promise<void>;
  broadcast(msg: string): Promise<void>;
  quit: () => Promise<void>;

  // Internal use:
  subscriber: Redis.Redis;
  handlerSets: HandlerSets;
  isShutdown: boolean;
  send(name: string, scope: HandlerScope, msg: string): Promise<void>;
}


function newRedis(name: string, opts?: Redis.RedisOptions): Redis.Redis {
  const isDockerized = process.env['DOCKERIZED'] === 'true';
  const host = isDockerized ? 'redis' : 'localhost';
  const allOpts = _.merge({}, { host }, opts);
  const client = new Redis(allOpts);
  installEventEchoing(client, name);
  return client;
}

const sequenceArrOfTask = Arr.array.sequence(Task.task);

export function createServiceComm(name: string): Promise<ServiceComm> {

  return new Promise((resolve) => {
    const subscriber = newRedis(name);

    const serviceComm: ServiceComm = {
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
          serviceComm.handlerSets.inbox :
          channelScope === 'local' ?
            serviceComm.handlerSets.local :
            channelScope === 'broadcast' ?
              serviceComm.handlerSets.broadcast : undefined;

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

      serviceComm.send(name, 'local', `received::${channel}::${msg}`)
        .then(() => sequenceArrOfTask(handlersForMessage)())
        .then(() => {
          return serviceComm.send(name, 'local', `handled::${channel}::${msg}`)
        })
        .catch((err) => {
          putStrLn(`${name} [WARN]> ${msg} on ${channel}: ${err}`);
        });
    });

    subscriber.on('ready', () => {
      subscriber.subscribe(`${name}.inbox`)
      subscriber.subscribe(`${name}.local`)
        .then(() => resolve(serviceComm));
    });
  });
}


function installEventEchoing(r: Redis.Redis, name: string) {
  _.each(RedisConnectionEvents, (e: string) => {
    r.on(e, () => putStrLn(`${name} [${e}]>`));
  });
}

// const defaultServiceTasks: ServiceLifecycleHandlers = {
//   async onStartup(): Promise<void> {
//     putStrLn(`${this.serviceName} [startup]`);
//   },
//   async onShutdown(): Promise<void> {
//     putStrLn(`${this.serviceName} [shutdown]`);
//   },
//   async onPing(): Promise<void> {
//     putStrLn(`${this.serviceName} [ping]`);
//   },
//   async onRun(): Promise<void> {
//     putStrLn(`${this.serviceName} [run]`);
//   },
// };
// export function addService(serviceName: string, service: Partial<ServiceHandlers>): void {
//   const tasks = _.merge({}, defaultServiceTasks, service, { serviceName });
//   serviceDef[serviceName] = tasks;
// }
// const serviceDef: Record<string, Omit<ServiceHandlers, 'serviceName' | 'getServiceComm'>> = {};
