import _ from "lodash";

import { ServiceComm, createServiceComm, HandlerSet, unpackLocalMessage } from './service-comm';
import { delay } from 'commons';


export interface LifecycleHandlers<T> {
  onStartup(this: SatelliteService<T>): Promise<void>;
  onShutdown(this: SatelliteService<T>): Promise<void>;
  onPing(this: SatelliteService<T>): Promise<void>;
  onRun(this: SatelliteService<T>): Promise<void>;
  on(this: SatelliteService<T>): Promise<void>;
}

export interface SatelliteService<T> extends Partial<LifecycleHandlers<T>> {
  serviceName: string;
  getServiceComm(): ServiceComm;
  cargo: T;
}

export interface ServiceHub {
  name: string;
  getComm(): ServiceComm;
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
  const serviceComm = await createServiceComm(satelliteName);


  return serviceDef
    .cargoInit(serviceComm)
    .then(async (cargo) => {

      const satService: SatelliteService<T> = {
        ...serviceDef.lifecyleHandlers,
        serviceName: satelliteName,
        getServiceComm() {
          return serviceComm;
        },
        cargo,
      };

      serviceComm.addHandler(
        'local', '.*',
        async (msg: string) => {
          const lm = unpackLocalMessage(msg);
          if (lm.scope === 'inbox') {
            switch (lm.localMessage) {
              case 'received':
                return serviceComm.sendTo(hubName, `ack~${lm.message}`);
              case 'handled':
                return serviceComm.sendTo(hubName, `done~${lm.message}`);
              default:
                serviceComm.log.warn(`${satelliteName} [unhandled]> #${msg}`);
            }
          }
        });
      serviceComm.addHandler(
        'broadcast', `${hubName}:shutdown`,
        async () => {
          if (satService.onShutdown) {
            await satService.onShutdown()
          }
          return serviceComm.quit();
        },
      );

      serviceComm.addHandlers('inbox', {
        'ping': async () => { if (satService.onPing) return satService.onPing(); },
        'run': async () => { if (satService.onRun) return satService.onRun(); },
      });

      serviceComm.subscriber.subscribe(`${hubName}.broadcast`);

      if (satService.onStartup) {
        await satService.onStartup();
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
    .then(comm => {
      const hub: ServiceHub = {
        name,
        getComm() { return comm; },
        serviceQuorum: [],
        async addSatelliteService(satelliteName: string): Promise<void> {
          await establishSatelliteConnection(this.getComm(), satelliteName);
          this.serviceQuorum.push(satelliteName);
        }
      };

      return hub;
    });
}
