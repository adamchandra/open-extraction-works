import _ from "lodash";

import { ServiceComm, createServiceComm, HandlerSet, getServiceLogger } from './service-comm';
import { putStrLn, delay } from 'commons';

const log = getServiceLogger('star');

export interface LifecycleHandlers<T> {
  onStartup(this: SatelliteService<T>): Promise<void>;
  onShutdown(this: SatelliteService<T>): Promise<void>;
  onPing(this: SatelliteService<T>): Promise<void>;
  onRun(this: SatelliteService<T>): Promise<void>;
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

async function logInboxMessageHandler(msg: string): Promise<void> {
  const [ogSender, ogMsg] = msg.split(/:/);
  log.debug(`[log inbox] ${msg}`);
}
async function logBroadcastMessageHandler(msg: string): Promise<void> {
  log.debug(`[log broadcast] ${msg}`);
}

export async function createSatelliteService<T>(
  name: string,
  serviceDef: SatelliteServiceDef<T>
): Promise<SatelliteService<T>> {
  const serviceComm = await createServiceComm(name);
  serviceComm.subscriber.subscribe(`hub.broadcast`);

  // serviceComm.addHandlers('local', { '.*': logLocalMessageHandler });
  serviceComm.addHandlers('inbox', { '.*': logInboxMessageHandler });
  serviceComm.addHandlers('broadcast', { '.*': logBroadcastMessageHandler });

  serviceComm.addHandlers('local', {
    '.*': async (msg: string) => {
      const [localMessage, originalChannel, originalMsg] = msg.split(/::/);
      const [, originalScope] = originalChannel.split(/\./);
      const [ogSender, ogMsg] = originalMsg.split(/:/);


      if (originalScope === 'inbox') {
        switch (localMessage) {
          case 'received':
            return serviceComm.sendTo('hub', `ack~${ogMsg}`)
          case 'handled':
            return serviceComm.sendTo('hub', 'done')
          default:
            log.warn(`${name} [unhandled]> #${msg}`);
        }
      }
    },
  });

  return serviceDef
    .cargoInit(serviceComm)
    .then(async (cargo) => {

      const satService: SatelliteService<T> = {
        ...serviceDef.lifecyleHandlers,
        serviceName: name,
        getServiceComm() {
          return serviceComm;
        },
        cargo,
      };
      serviceComm.addHandlers('broadcast', {
        'shutdown': async () => {
          if (satService.onShutdown) {
            await satService.onShutdown()
          }
          return serviceComm.quit();
        },
      });
      serviceComm.addHandlers('inbox', {
        'ping': async () => { if (satService.onPing) return satService.onPing(); },
        'run': async () => { if (satService.onRun) return satService.onRun(); },
      });

      if (satService.onStartup) {
        await satService.onStartup();
      }

      return satService;
    });
}

async function establishSatelliteConnection(hubName: string, hubComm: ServiceComm, satelliteName: string): Promise<void> {
  const handlerSet: HandlerSet = {};
  let pingedSatellite = false;
  handlerSet[`${satelliteName}:ack~ping`] = async (msg) => {
    putStrLn(`${hubName}> addSatelliteService`, msg);
    pingedSatellite = true;
  };
  hubComm.addHandlers('inbox', handlerSet);
  const tryPing = async () => {
    if (pingedSatellite) {
      putStrLn(`${hubName}> addSatelliteService: succesfully pinged`, satelliteName);
      return;
    }
    putStrLn(`${hubName}> createServiceComm: pinging`, satelliteName);
    await hubComm.sendTo(satelliteName, 'ping');
    await delay(200).then(() => tryPing())
  };
  await tryPing();
  putStrLn(`${hubName}> addSatelliteService: added`, satelliteName);
}

export async function createHubService(name: string): Promise<ServiceHub> {
  return await createServiceComm(name)
    .then(comm => {
      const hub: ServiceHub = {
        name,
        getComm() { return comm; },
        serviceQuorum: [],
        async addSatelliteService(satelliteName: string): Promise<void> {
          await establishSatelliteConnection(name, this.getComm(), satelliteName);
          this.serviceQuorum.push(satelliteName);
        }
      };

      return hub;
    });
}
