import _ from "lodash";

import { ServiceComm, createServiceComm, unpackLocalMessage } from './service-comm';
import { delay } from 'commons';

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
  cargo: T;
}

export interface ServiceHub {
  name: string;
  commLink: ServiceComm;
  addSatelliteService(name: string): Promise<void>;
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

      const satService: SatelliteService<T> = {
        ...serviceDef.lifecyleHandlers,
        serviceName: satelliteName,
        commLink,
        cargo,
      };

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
        });
      commLink.addHandler(
        'inbox', `${hubName}:.*`,
        async (message: string) => {
          const [, msg] = message.split(/:/);
          const lmsg: LifecycleName = msg as any;
          const handler = satService[lmsg];
          if (handler) {
            const satHandler = _.bind(handler, satService);
            await satHandler();
          }
        },
      );
      commLink.addHandler(
        'broadcast', `${hubName}:shutdown`,
        async () => {
          const handler = satService['shutdown'];
          if (handler) {
            const satHandler = _.bind(handler, satService);
            await satHandler();
          }
          return commLink.quit();
        },
      );

      commLink.subscriber.subscribe(`${hubName}.broadcast`);

      const startup = satService['startup'];
      if (startup) {
        const satHandler = _.bind(startup, satService);
        await satHandler();
      }

      return satService;
    });
}

async function establishSatelliteConnection(hubComm: ServiceComm, satelliteName: string): Promise<void> {
  let pingedSatellite = false;
  hubComm.addHandler(
    'inbox',
    `${satelliteName}:ack~link`,
    async () => { pingedSatellite = true; }
  );
  const tryPing = async () => {
    if (pingedSatellite) {
      return;
    }
    await hubComm.sendTo(satelliteName, 'link');
    await delay(200).then(() => tryPing())
  };
  await tryPing();
  hubComm.log.info(`established link to ${satelliteName}`);
}

export async function createHubService(name: string): Promise<ServiceHub> {
  return await createServiceComm(name)
    .then(commLink => {
      const hub: ServiceHub = {
        name,
        commLink,
        serviceQuorum: [],
        async addSatelliteService(satelliteName: string): Promise<void> {
          await establishSatelliteConnection(this.commLink, satelliteName);
          this.serviceQuorum.push(satelliteName);
        }
      };

      return hub;
    });
}
