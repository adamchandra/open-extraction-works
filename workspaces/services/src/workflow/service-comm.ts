import _ from "lodash";
import Redis from 'ioredis';
import Async from 'async';

import winston, {
  createLogger,
  transports,
  format,
} from "winston";

export function getServiceLogger(label: string): winston.Logger {
  const cli = winston.config.cli;
  return createLogger({
    level: 'silly',
    levels: cli.levels,
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.label({ label, message: true }),
          format.simple(),
        ),
      })
    ],
  });
}

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
  log: winston.Logger;
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

export interface LocalMessage {
  sourceMsg: string;
  localMessage: string;
  channel: string;
  qualifiedMessage: string;
  receiver: string;
  scope: string;
  sender: string;
  message: string;

}

export function unpackLocalMessage(sourceMsg: string): LocalMessage {
  // sourceMsg = received::service-2.inbox::hub:run
  const [localMessage, channel, qualifiedMessage] = sourceMsg.split(/::/);
  // [received  service-2.inbox  hub:run]
  const [receiver, scope] = channel.split(/\./);
  //   [service-2,  inbox]
  const [sender, message] = qualifiedMessage.split(/:/);
  // [hub, run]
  return {
    sourceMsg, localMessage, channel, qualifiedMessage,
    receiver, scope, sender, message,
  };
}

export function createServiceComm(name: string): Promise<ServiceComm> {

  return new Promise((resolve) => {
    const subscriber = newRedis(name);

    const serviceComm: ServiceComm = {
      name,
      subscriber,
      isShutdown: false,
      log: getServiceLogger(`${name}/comm`),
      handlerSets: {
        'inbox': [],
        'local': [],
        'broadcast': []
      },
      async send(recipient: string, scope: HandlerScope, msg: string): Promise<void> {
        if (this.isShutdown) return;

        const publisher = this.subscriber.duplicate();
        await publisher.publish(`${recipient}.${scope}`, msg);
        if (scope === 'local') {
          const lm = unpackLocalMessage(msg);
          // this.log.debug(`${ogReceiver} [${localMessage}:${originalScope}]> #${ogSender}:${ogMsg}`);
          this.log.debug(`${lm.localMessage}:local> #${lm.sender}:${lm.message}`);
        } else {
          this.log.info(`sent> #${msg} -[to]-> ${recipient}`)
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

      const handlerScope: HandlerScope = channelScope as any;
      const scopedHandlers = serviceComm.handlerSets[handlerScope]

      if (scopedHandlers === undefined) {
        serviceComm.log.error(`Error: Received unknown scoped message ${msg} on ${channel}`);
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

      const isLocalMessage = handlerScope === 'local';
      if (isLocalMessage) {
        Async.mapSeries(handlersForMessage, async (handler) => handler())
          .catch((err) => {
            serviceComm.log.error(`> ${msg} on ${channel}: ${err}`)
          });
        return;
      }

      serviceComm.send(name, 'local', `received::${channel}::${msg}`)
        // .then(() => serviceComm.log.info(`receive> #${msg}`))
        .then(() => Async.mapSeries(handlersForMessage, async (handler) => handler()))
        .then(() => serviceComm.send(name, 'local', `handled::${channel}::${msg}`))
        // .then(() => serviceComm.log.info(`handled> #${msg}`))
        .catch((err) => {
          serviceComm.log.warn(`> ${msg} on ${channel}: ${err}`)
        });
    });

    subscriber.on('ready', () => {
      subscriber.subscribe(`${name}.inbox`)
        .then(() => subscriber.subscribe(`${name}.local`))
        .then(() => resolve(serviceComm))
        .catch((err) => {
          serviceComm.log.error(`subscribe> ${err}`)
        });
    });
  });
}

function installEventEchoing(r: Redis.Redis, name: string) {
  const log = getServiceLogger(`${name}/redis`);
  _.each(RedisConnectionEvents, (e: string) => {
    r.on(e, () => log.debug(`> ${e}`));
  });
}
