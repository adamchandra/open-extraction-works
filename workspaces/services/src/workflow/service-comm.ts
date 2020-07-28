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

type Thunk = () => Promise<void>;
type HandlerInstance = (msg: string) => Promise<void>;
export type HandlerSet = Record<string, HandlerInstance>;

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
  addHandler: (scope: HandlerScope, regex: string, handler: HandlerInstance) => void;
  sendTo(name: string, msg: string): Promise<void>;
  sendSelf(selfMsg: string, channel: string, msg: string): Promise<void>;
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
  const [localMessage, channel, qualifiedMessage] = sourceMsg.split(/::/);
  const [receiver, scope] = channel.split(/\./);
  const [sender, message] = qualifiedMessage.split(/:/);
  return {
    sourceMsg, localMessage, channel, qualifiedMessage,
    receiver, scope, sender, message,
  };
}

function getScopedMessageHandlers(
  scope: string,
  message: string,
  serviceComm: ServiceComm
): Thunk[] {
  const handlerScope: HandlerScope = scope as any;
  const scopedHandlers = serviceComm.handlerSets[handlerScope]

  if (scopedHandlers === undefined) {
    serviceComm.log.error(`Error: Received unknown scoped message ${message} in ${scope}`);
    return [];
  }
  return _.flatMap(scopedHandlers, (hs) => {
    return _.flatMap(_.toPairs(hs), ([k, v]) => {
      const keyMatches = message.match(k)
      if (keyMatches) {
        return [() => v(message)];
      }
      return [];
    })
  });
}

export function createServiceComm(name: string): Promise<ServiceComm> {

  return new Promise((resolve, reject) => {
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
        await publisher.quit();
      },
      async sendTo(recipient: string, msg: string): Promise<void> {
        const prefixedMsg = `${name}:${msg}`;
        this.log.info(`sending> #${msg} -[to]-> ${recipient}`)
        return this.send(recipient, 'inbox', prefixedMsg);
      },
      async sendSelf(selfMsg: string, channel: string, msg: string): Promise<void> {
        return this.send(this.name, 'local', `${selfMsg}::${channel}::${msg}`);
      },
      async broadcast(msg: string): Promise<void> {
        const prefixedMsg = `${name}:${msg}`;
        this.log.info(`broadcasting> #${msg}`)
        return this.send(name, 'broadcast', prefixedMsg);
      },
      addHandlers(scope: HandlerScope, hs: HandlerSet): void {
        this.handlerSets[scope].push(hs);
      },
      addHandler(scope: HandlerScope, regex: string, handler: HandlerInstance): void {
        const handlerSet: HandlerSet = {};
        handlerSet[regex] = handler;
        this.addHandlers(scope, handlerSet);
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
      // serviceComm.log.debug(`${name}.on('message', ('${channel}', '${msg}') => ...`);

      const channelParts = channel.split(/\./);
      const [, channelScope] = channelParts;
      if (channelScope === undefined) {
        serviceComm.log.error(`Error: Unknown scope in ${channel}: msg: ${msg}`);
        return;
      }

      const handlersForMessage = getScopedMessageHandlers(channelScope, msg, serviceComm);

      const haveHandlers = handlersForMessage.length > 0;
      const isLocalMessage = channelScope === 'local';

      if (isLocalMessage) {
        const lm = unpackLocalMessage(msg);
        serviceComm.log.info(`${lm.localMessage}:local> #${lm.sender}:${lm.message}`);
        Async.mapSeries(handlersForMessage, async (handler) => handler())
          .catch((err) => {
            serviceComm.log.error(`> ${msg} on ${channel}: ${err}`)
          });
        return;
      }

      const respondIfHandled = async () => {
        if (haveHandlers) {
          return serviceComm.sendSelf('handled', channel, msg);
        }
      };
      serviceComm.sendSelf('received', channel, msg)
        .then(() => Async.mapSeries(handlersForMessage, async (handler) => handler()))
        .then(respondIfHandled)
        .catch((err) => {
          serviceComm.log.warn(`> ${msg} on ${channel}: ${err}`)
        });
    });

    subscriber.on('ready', () => {
      subscriber.subscribe(`${name}.inbox`, `${name}.local`)
        .then(() => resolve(serviceComm))
        .catch((err) => {
          serviceComm.log.error(`subscribe> ${err}`)
          reject(`${name} subscribe> ${err}`)
        });
    });
  });
}

function installEventEchoing(r: Redis.Redis, name: string) {
  const log = getServiceLogger(`${name}/redis`);
  _.each(RedisConnectionEvents, (e: string) => {
    r.on(e, () => log.debug(`event:${e}`));
  });
}
