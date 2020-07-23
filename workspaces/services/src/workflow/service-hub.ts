import _ from "lodash";

import { ServiceComm, createServiceComm, getWorkflowServiceLogger } from './service-comm';

const log = getWorkflowServiceLogger();

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
  name: string,
  serviceDef: SatelliteServiceDef<T>
): Promise<SatelliteService<T>> {
  const serviceComm = await createServiceComm(name);
  serviceComm.subscriber.subscribe(`hub.broadcast`);

  serviceComm.addHandlers('local', {
    '.*': async (msg: string) => {
      const [localMessage, originalChannel, originalMsg] = msg.split(/::/);
      const [, originalScope] = originalChannel.split(/\./);

      if (originalScope === 'inbox') {
        switch (localMessage) {
          case 'received':
            return serviceComm.sendTo('hub', 'ack')
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

export async function createHubService(name: string): Promise<ServiceComm> {
  const serviceComm = await createServiceComm(name);
  return serviceComm;
}
