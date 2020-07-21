import _ from "lodash";
import { getHubRedisPool, getSatelliteRedisPool, NamedRedisPool } from './workflow';
import { putStrLn } from 'commons';
import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';

export interface ServiceHandlers {
  serviceName: string;
  onStartup(this: ServiceHandlers): Promise<void>;
  onShutdown(this: ServiceHandlers): Promise<void>;
  onPing(this: ServiceHandlers): Promise<void>;
  onRun(this: ServiceHandlers): Promise<void>;
  getRedisPool(): NamedRedisPool;
}

const defaultServiceTasks: Omit<ServiceHandlers, 'serviceName' | 'getRedisPool'> = {
  async onStartup(): Promise<void> {
    putStrLn(`${this.serviceName} [startup]`);
  },
  async onShutdown(): Promise<void> {
    putStrLn(`${this.serviceName} [shutdown]`);
  },
  async onPing(): Promise<void> {
    putStrLn(`${this.serviceName} [ping]`);
  },
  async onRun(): Promise<void> {
    putStrLn(`${this.serviceName} [run]`);
  },
};

export const WorkflowServiceNames = [
  'hub',
  'rest-portal',
  'upload-ingestor',
  'field-extractor',
  'spider',
];

export function runService(serviceName: string, dockerize: boolean) {
  if (dockerize) {
    process.env['DOCKERIZED'] = 'true';
  }
  if (serviceName === 'hub') {
    createHubService()
      .then(() => {
        putStrLn(`Created Hub Service`);
      })
    return;
  }
  const serviceHandlers = serviceDef[serviceName];
  if (!serviceHandlers) {
    putStrLn(`Service Init Error: ${serviceName} not registered`);
    return;
  }
  createSatelliteService(serviceName, serviceHandlers)
    .then(() => {
      putStrLn(`Created Satellite Service ${serviceName}`);
    })


}

const serviceDef: Record<string, Omit<ServiceHandlers, 'serviceName' | 'getRedisPool'>> = {};

function addService(serviceName: string, service: Partial<ServiceHandlers>): void {
  const tasks = _.merge({}, defaultServiceTasks, service, { serviceName });
  serviceDef[serviceName] = tasks;
}


export async function createSatelliteService(
  serviceName: string,
  serviceHandlers: Omit<ServiceHandlers, 'serviceName' | 'getRedisPool'>
): Promise<NamedRedisPool> {
  const servicePool = await getSatelliteRedisPool(serviceName);
  const fullHandlers: ServiceHandlers = _.merge(
    {},
    serviceHandlers, {
    serviceName,
    getRedisPool() {
      return servicePool;
    }
  });

  servicePool.handleInbox({
    'startup': async () => fullHandlers.onStartup(),
    'shutdown': async () => fullHandlers.onShutdown(),
    'ping': async () => fullHandlers.onPing(),
    'run': async () => fullHandlers.onRun(),
  });
  await fullHandlers.onStartup();
  return servicePool;
}

export async function createHubService(): Promise<NamedRedisPool> {
  const hubPool = await getHubRedisPool('hub')

  hubPool.handleInbox({
    'rest-portal:done': async () => {
      await hubPool.sendTo('upload-ingestor', 'run');
    },
    'upload-ingestor:done': async () => {
      await hubPool.sendTo('spider', 'run');
    },
    'spider:done': async () => {
      await hubPool.sendTo('field-extractor', 'run');
    },
  });

  return hubPool;
}

addService('rest-portal', {
  async onStartup(): Promise<void> {
    putStrLn(`rest-portal> startup`);
    const redisPool = this.getRedisPool();
    startRestPortal(redisPool);
    return;
  },
  async onRun(): Promise<void> {
    putStrLn(`spider> run`);
    return;
  }
});

addService('spider', {
  async onStartup(): Promise<void> {
    putStrLn(`spider> startup`);
    return;
  },
  async onRun(): Promise<void> {
    putStrLn(`spider> run`);
    return;
  }
});

addService('upload-ingestor', {
  async onRun(): Promise<void> {
    putStrLn(`upload-ingestor> start`);
    // figure out which urls we know about, which fields, etc.,
    // create a response json detailing what we have/don't have,
    //    and endpoints to download, check status, etc.
    return;
  }
});

// const servicePairs = _.zip(serviceNames, serviceNames.slice(1));
// _.flatMap(servicePairs, ([service1, service2]) => {
//   if (service1 && service2) {
//     const key = `${service1}:done`;
//     const value = async () => {
//       await hubPool.sendTo(`${service2}`, 'start');
//     };
//     return [[key, value]];
//   }
//   return [];
// });
