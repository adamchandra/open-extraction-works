import _ from "lodash";
import { putStrLn } from 'commons';
import Redis from 'ioredis';
import * as Task from 'fp-ts/lib/Task';
import * as Arr from 'fp-ts/lib/Array';

import winston, {
  createLogger,
  transports,
  format,
} from "winston";

const cli = winston.config.cli;
const _logger = createLogger({
  level: 'silly',
  levels: cli.levels,
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple(),
      ),
    })
  ],
});

export const getWorkflowServiceLogger = () => _logger;

const log = getWorkflowServiceLogger();

const RedisConnectionEvents = [
  'ready',
  'close',
  'end',
  'error',
  'connect',
  'reconnecting'
];

type HandlerInstance = (msg: string) => Promise<void>
export type HandlerSet = Record<string, HandlerInstance>

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
        // putStrLn(`${name} [sent:${scope}]> #${msg} -[to]-> ${recipient}`);
        if (scope === 'local') {
          log.debug(`${name} [local]> #${msg}`)
        } else {
          log.info(`${name} [sent]> #${msg} -[to]-> ${recipient}`)
        }
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
          .then(() => log.debug(`${name} [local]> #${msg}`))
          .catch((err) => {
            log.error(`${name}> ${msg} on ${channel}: ${err}`)
          });
        return;
      }

      serviceComm.send(name, 'local', `received::${channel}::${msg}`)
        .then(() => log.info(`${name} [received]> #${msg}`))
        .then(() => sequenceArrOfTask(handlersForMessage)())
        .then(() => serviceComm.send(name, 'local', `handled::${channel}::${msg}`))
        .then(() => log.info(`${name} [handled]> #${msg}`))
        .catch((err) => {
          log.warn(`${name}> ${msg} on ${channel}: ${err}`)
        });
    });

    subscriber.on('ready', () => {
      subscriber.subscribe(`${name}.inbox`)
        .then(() => subscriber.subscribe(`${name}.local`))
        .then(() => resolve(serviceComm))
        .catch((err) => {
          log.error(`${name} [subscribe]> ${err}`)
        });
    });
  });
}


function installEventEchoing(r: Redis.Redis, name: string) {
  _.each(RedisConnectionEvents, (e: string) => {
    r.on(e, () => log.debug(`${name} [redis:${e}]>`));
  });
}
