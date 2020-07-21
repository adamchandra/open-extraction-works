import _ from "lodash";
import { getHubRedisPool, getSatelliteRedisPool } from './workflow';
import { putStrLn } from 'commons';

export interface ServiceTasks {
  serviceName: string;
  onStartup(this: ServiceTasks): Promise<void>;
  onShutdown(this: ServiceTasks): Promise<void>;
  onPing(this: ServiceTasks): Promise<void>;
  onRun(this: ServiceTasks): Promise<void>;
}

const defaultServiceTasks: ServiceTasks = {
  serviceName: '',
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
}

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
        console.log('created satelliteService');
      })
    return;
  }
  const serviceTasks = serviceDef[serviceName];
  if (!serviceTasks) {
    putStrLn(`Service Init Error: ${serviceName} not registered`);
    return;
  }
  createSatelliteService(serviceName, serviceTasks)
    .then(() => {
      console.log('created satelliteService');
    })


}

const serviceDef: Record<string, ServiceTasks> = {};

function addService(serviceName: string, service: Partial<ServiceTasks>): void {
  const tasks = _.merge({}, defaultServiceTasks, service, { serviceName });
  serviceDef[serviceName] = tasks;
}


export async function createSatelliteService(
  serviceName: string,
  serviceTasks: ServiceTasks
) {
  const servicePool = await getSatelliteRedisPool(serviceName);
  servicePool.handleInbox({
    'startup': async () => serviceTasks.onStartup(),
    'shutdown': async () => serviceTasks.onShutdown(),
    'ping': async () => serviceTasks.onPing(),
    'run': async () => serviceTasks.onRun(),
  });
}


export async function createHubService() {
  const hubPool = await getHubRedisPool('hub')

  hubPool.handleInbox({
    'rest-portal:done': async () => {
      await hubPool.sendTo('upload-ingestor', 'start');
    },
    'upload-ingestor:done': async () => {
      await hubPool.sendTo('spider', 'start');
    },
    'spider:done': async () => {
      await hubPool.sendTo('field-extractor', 'start');
    },
  });

}

addService('spider', {
  async onRun(): Promise<void> {
    putStrLn(`spider> start`);
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
