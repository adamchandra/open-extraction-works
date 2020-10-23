import _ from 'lodash';

import { ServiceComm, createServiceComm } from './service-comm';
import { delay, prettyPrint, putStrLn, slidingWindow } from 'commons';
import winston from 'winston';
import Async from 'async';
import { Forward, HandlerInstance, Message } from './service-defs';

export type LifecycleName = keyof {
  startup: null,
  shutdown: null,
  step: null,
  run: null,
  ping: null,
};

export type LifecycleMod = keyof {
  ack: null,
  done: null,
  yield: null,
}

export const LifecyclePhase: Record<LifecycleName, LifecycleMod[]> = {
  startup: ['done'],
  shutdown: ['ack'],
  step: ['yield', 'done'],
  run: ['yield', 'done'],
  ping: ['ack'],
};

export interface SatelliteComm {
  hubName: string;
  commLink: ServiceComm;
  sendHub(msg: LifecycleMod, includeMessage: Message): Promise<void>;
  // echoBack(msg: string): Promise<void>;
  // run<A, B>(a: A): Promise<B>;
  // yield<A, B>(a: A): Promise<B>;
}

// export type LifecycleHandler<T, R> = (this: SatelliteService<T>, payload: unknown) => Promise<R>;
export type LifecycleHandler<T, R> = HandlerInstance<T, R>;
export type LifecycleHandlers<T> = Record<LifecycleName, LifecycleHandler<T, void>>;

export interface SatelliteService<T> extends Partial<LifecycleHandlers<T>> {
  serviceName: string;
  // commLink: ServiceComm;
  satComm: SatelliteComm;
  log: winston.Logger;
  cargo: T;
}

export interface ServiceHub {
  name: string;
  commLink: ServiceComm;
  addSatelliteService(name: string): Promise<void>;
  shutdownSatellites(): Promise<void>;
}

export interface SatelliteServiceDef<T> {
  lifecyleHandlers: Partial<LifecycleHandlers<T>>;
  cargoInit: (sc: ServiceComm) => Promise<T>;
}


export function defineSatelliteService<T>(
  cargoInit: (sc: ServiceComm) => Promise<T>,
  lifecyleHandlers: Partial<LifecycleHandlers<T>>
): SatelliteServiceDef<T> {
  return {
    cargoInit,
    lifecyleHandlers
  };
}


export async function createSatelliteService<T>(
  hubName: string,
  satelliteName: string,
  serviceDef: SatelliteServiceDef<T>
): Promise<SatelliteService<T>> {
  const commLink = await createServiceComm(satelliteName);
  const satComm: SatelliteComm = {
    hubName,
    commLink,
    async sendHub(hubMessage: LifecycleMod, includeMsg: Message): Promise<void> {
      const message = Message.create({
        from: satelliteName,
        to: hubName,
        messageType: hubMessage,
      }, Forward.create(includeMsg));
      return commLink.send(message);
    },

    // async echoBack(msg: string): Promise<void> {
    //   const prefixedMsg = `${satelliteName}:${msg}`;
    //   return this.sendHub('echo', `${satelliteName}.inbox`, prefixedMsg);
    // },
    // async run<A, B>(a: A): Promise<B> {
    //   ///
    //   return a as any as B;
    // },
    // async yield<A, B>(a: A): Promise<B> {
    //   // serialize a
    //   // this.('yield')
    //   const responsePromise = new Promise<B>((resolve) => {
    //     const responseStream = commLink.subscriber.duplicate();
    //     commLink.addHandler(
    //       'yield-back',
    //       async (msg: Message) => {
    //         // const [, ybMsg] = msg.split('~');
    //         const dummyResponse = 'todo' as any as B;
    //         responseStream.quit()
    //           .then(() => resolve(dummyResponse));
    //       }
    //     );
    //   });
    //   // const aMsg = `${name}:${a}`;
    //   // await commLink.sendSelf('yield', `${satelliteName}.inbox`, aMsg);
    //   return responsePromise;
    // },
  };

  return serviceDef
    .cargoInit(commLink)
    .then(async (cargo) => {
      const logLevel = process.env['${satelliteName}.loglevel'] || 'info';

      const satService: SatelliteService<T> = {
        ...serviceDef.lifecyleHandlers,
        serviceName: satelliteName,
        log: commLink.log.child({
          level: logLevel
        }),
        satComm,
        cargo,
      };

      async function runHandler(handlerName: string): Promise<void> {
        const hname: LifecycleName = handlerName as any;
        const handler = satService[hname];
        if (handler) {
          const satHandler = _.bind(handler, satService);
          return satHandler(handlerName);
        }
      }

      commLink.addHandler(
        '.*',
        async (msg: Message) => {
          // const lm = unpackLocalMessage(msg);
          switch (msg.messageType) {
            case 'received':
              return satComm.sendHub('ack', msg);
            case 'handled':
              return satComm.sendHub('done', msg);
            // case 'echo':
            //   return satComm.sendHub(`echo~${lm.message}`);
            // case 'yield':
            //   prettyPrint({ msg: 'yielding...', lm });
            //   return satComm.sendHub(`yield~${lm.message}`);
            // case 'yield-back':
            //   prettyPrint({ msg: 'yielding back...', lm });
            //   return satComm.sendHub(`yield-back~${lm.message}`);
            default:
              commLink.log.warn(`${satelliteName} [unhandled]> #${msg}`);
          }
        });

      commLink.addHandler(
        `${hubName}:.*`,
        async (message: Message) => {
          const [, msg] = message.split(/:/);
          putStrLn(`${name} inbox: ${message}`);
          await runHandler(msg);
          if (msg === 'shutdown') {
            await commLink.quit();
          }
        });

      await runHandler('startup');

      return satService;
    });
}

async function establishSatelliteConnection(hubComm: ServiceComm, satelliteName: string): Promise<void> {
  let pingedSatellite = false;
  hubComm.addHandler(
    `${satelliteName}:done~link`,
    async () => {
      pingedSatellite = true;
    }
  );
  const tryPing: () => Promise<void> = async () => {
    hubComm.log.info(`${hubComm.name} pinging ${satelliteName}`);
    if (pingedSatellite) {
      return;
    }
    await hubComm.sendTo(satelliteName, 'link');
    return delay(200).then(async () => {
      return tryPing();
    });
  };
  return tryPing();
}

export async function createHubService(
  hubName: string,
  orderedServices: string[]
): Promise<[ServiceHub, Promise<void>]> {

  return await createServiceComm(hubName)
    .then(commLink => {
      const hubService: ServiceHub = {
        name: hubName,
        commLink,
        async addSatelliteService(satelliteName: string): Promise<void> {
          return establishSatelliteConnection(this.commLink, satelliteName);
        },
        async shutdownSatellites(): Promise<void> {
          const allAckedShutdown = Async.map<string, void, Error>(
            orderedServices,
            async serviceName => {
              return new Promise(resolve => {
                hubService.commLink.addHandler(
                  `${serviceName}:ack~shutdown`,
                  async () => resolve()
                );
              });
            }).then(() => undefined);

          await Async.map<string, void, Error>(
            orderedServices,
            async serviceName => this.commLink.sendTo(serviceName, 'shutdown')
          ).then(() => undefined);

          return allAckedShutdown;
        }
      };

      const connectedPromise = new Promise<void>(resolve => {
        Async.map<string, void, Error>(
          orderedServices,
          async s => hubService.addSatelliteService(s)
        ).then(() => {
          return commLink.sendSelf('handled', `${hubName}.inbox`, `${hubName}:sat-linked`);
        });

        hubService.commLink.addHandler(
          `${hubName}:sat-linked`,
          async () => resolve()
        );
      });

      _.each(
        orderedServices,
        svc => {
          hubService.commLink.addHandler(
            `${svc}:echo~.*`,
            async (msg: string) => {
              const [, echoedMsg] = msg.split('~');
              await hubService.commLink.sendTo(`${svc}`, echoedMsg)
            }
          );
        }
      );
      const pairWise = slidingWindow(2);
      const servicePairs = pairWise(orderedServices);
      const firstService = _.first(orderedServices);
      const lastService = _.last(orderedServices);

      if (firstService === undefined || lastService === undefined) {
        return [hubService, connectedPromise];
      }


      _.each(servicePairs, ([svc1, svc2]) => {
        commLink.log.info(`connecting services ${svc1} => ${svc2}`);

        // TODO allow two-way communication for run/respond
        hubService.commLink.addHandler(
          `${svc1}:done~.*`,
          async (msg: string) => {
            const [, sentMsg] = msg.split(':');
            const [, echoedMsg] = sentMsg.split('~');
            await hubService.commLink.sendTo(`${svc2}`, echoedMsg);
          }
        );


        hubService.commLink.addHandler(
          `${svc1}:yield~.*`,
          async (msg: string) => {
            const [, sentMsg] = msg.split(':');
            const [, yieldMsg] = sentMsg.split('~');
            const runMsg = `run:${yieldMsg}`
            await hubService.commLink.sendTo(`${svc2}`, runMsg);
          }
        );

        hubService.commLink.addHandler(
          `${svc2}:yield-back~.*`,
          async (msg: string) => {
            const [, sentMsg] = msg.split(':');
            const [, yieldMsg] = sentMsg.split('~');
            const ybMsg = `yield-back:${yieldMsg}`
            await hubService.commLink.sendTo(`${firstService}`, ybMsg);
          }
        );

      });

      hubService.commLink.addHandler(
        `${lastService}:run:.*`,
        async (msg: string) => {
          const [, sentMsg] = msg.split(':');
          const [, yieldMsg] = sentMsg.split('~');
          const ybMsg = `yield-back~${yieldMsg}`
          await hubService.commLink.sendTo(`${firstService}`, ybMsg);
        }
      );


      return [hubService, connectedPromise];
    });
}
