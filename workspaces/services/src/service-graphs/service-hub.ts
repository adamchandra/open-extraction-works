import _ from "lodash";

import { ServiceComm, createServiceComm, unpackLocalMessage } from './service-comm';
import { delay, slidingWindow } from 'commons';
import winston from "winston";
import Async from 'async';

export type LifecycleName = keyof {
  startup: null,
  shutdown: null,
  run: null,
  step: null,
  ping: null,
}

export type LifecycleHandler<T, R> = (this: SatelliteService<T>) => Promise<R>;
export type LifecycleHandlers<T> = Record<LifecycleName, LifecycleHandler<T, void>>;

export interface SatelliteService<T> extends Partial<LifecycleHandlers<T>> {
  serviceName: string;
  commLink: ServiceComm;
  log: winston.Logger;
  cargo: T;
}

export interface ServiceHub {
  name: string;
  commLink: ServiceComm;
  addSatelliteService(name: string): Promise<void>;
  shutdownSatellites(): Promise<void>;
  serviceQuorum: string[];
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
        commLink,
        cargo,
      };

      async function runHandler(handlerName: string): Promise<void> {
        const hname: LifecycleName = handlerName as any;
        const handler = satService[hname];
        if (handler) {
          const satHandler = _.bind(handler, satService);
          return satHandler();
        }
      }

      commLink.addHandler(
        'local', '.*',
        async (msg: string) => {
          const lm = unpackLocalMessage(msg);
          if (lm.scope === 'inbox') {
            switch (lm.localMessage) {
              case 'received':
                return commLink.sendTo(hubName, `ack~${lm.message}`);
              case 'handled':
                return commLink.sendTo(hubName, `done~${lm.message}`);
              case 'emit':
                return commLink.sendTo(hubName, `emit~${lm.message}`);
              default:
                commLink.log.warn(`${satelliteName} [unhandled]> #${msg}`);
            }
          }
          if (lm.scope === 'broadcast') {
            switch (lm.localMessage) {
              case 'received':
                return commLink.sendTo(hubName, `ack~${lm.message}`);
              case 'handled':
                return commLink.sendTo(hubName, `done~${lm.message}`);
              default:
                commLink.log.warn(`${satelliteName} [unhandled]> #${msg}`);
            }
          }
        });

      commLink.addHandler(
        'inbox', `${hubName}:.*`,
        async (message: string) => {
          const [, msg] = message.split(/:/);
          await runHandler(msg);
        });

      commLink.addHandler(
        'broadcast', `${hubName}:.*`,
        async (message: string) => {
          const [, msg] = message.split(/:/);
          await runHandler(msg);
          if (msg === 'shutdown') {
            await commLink.quit();
          }
        });

      await commLink.subscriber.subscribe(`${hubName}.broadcast`);
      await runHandler('startup');

      return satService;
    });
}

async function establishSatelliteConnection(hubComm: ServiceComm, satelliteName: string): Promise<void> {
  let pingedSatellite = false;
  hubComm.addHandler(
    'local',
    `${satelliteName}:done~link`,
    async () => {
      // hubComm.log.info(`${hubComm.name} got ack from ${satelliteName}`);
      pingedSatellite = true;
    }
  );
  const tryPing: () => Promise<void> = async () => {
    hubComm.log.info(`${hubComm.name} pinging ${satelliteName}`);
    if (pingedSatellite) {
      // hubComm.log.info(`pinged == true from ${satelliteName}`);
      return;
    }
    await hubComm.sendTo(satelliteName, 'link');
    return delay(200).then(async () => {
      return tryPing();
    });
  };
  return tryPing().then(() => {
    // hubComm.log.info(`established link to ${satelliteName}`);
  });
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
        serviceQuorum: [],
        async addSatelliteService(satelliteName: string): Promise<void> {
          this.serviceQuorum.push(satelliteName);
          return establishSatelliteConnection(this.commLink, satelliteName);
        },
        async shutdownSatellites(): Promise<void> {
          const allAckedShutdown = Async.map<string, void, Error>(
            orderedServices,
            async serviceName => {
              return new Promise(resolve => {
                hubService.commLink.addHandler(
                  'local', `${serviceName}:ack~shutdown`,
                  async () => {
                    resolve();
                  }
                );
              });
            }).then(() => undefined);

          await this.commLink.broadcast('shutdown');
          return allAckedShutdown;
        }
      };

      Async.map<string, void, Error>(
        orderedServices,
        async s => hubService.addSatelliteService(s)
      ).then(() => {
        commLink.sendSelf('handled', `${hubName}.inbox`, `${hubName}:sat-linked`);
      });

      const connectedPromise = new Promise<void>(resolve => {
        hubService.commLink.addHandler(
          'local', `${hubName}:sat-linked`,
          async () => resolve()
        );
      });

      _.each(
        orderedServices,
        svc => {
          hubService.commLink.addHandler(
            'inbox', `${svc}:emit~.*`,
            async (msg: string) => {
              const [, emittedMsg] = msg.split('~');
              await hubService.commLink.sendTo(`${svc}`, emittedMsg)
            }
          );
        }
      );
      const pairWise = slidingWindow(2);
      const servicePairs = pairWise(orderedServices);
      _.each(servicePairs, ([svc1, svc2]) => {
        commLink.log.info(`connecting services ${svc1} => ${svc2}`);

        hubService.commLink.addHandler(
          'inbox', `${svc1}:done~.*`,
          async (msg: string) => {
            const [, sentMsg] = msg.split(':');
            const [, emittedMsg] = sentMsg.split('~');
            await hubService.commLink.sendTo(`${svc2}`, emittedMsg);
          }
        );
      });

      return [hubService, connectedPromise];
    });
}