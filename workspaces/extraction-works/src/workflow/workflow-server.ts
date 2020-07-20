import _ from "lodash";
import { getHubRedisPool, getSatelliteRedisPool } from './workflow';

import { putStrLn, arglib } from 'commons';

const { opt, config, registerCmd } = arglib;

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

const serviceNames = [
  'hub',
  'rest-portal',
  'upload-ingestor',
  'field-extractor',
  'spider',
];

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




function runMain() {
  const localYargs = arglib.YArgs;
  registerCmd(
    localYargs,
    "start-service",
    "start workflow service hub",
    config(
      opt.ion("dockerize", { boolean: true, default: false }),
      opt.ion("service-name: name of service to launch", {
        choices: serviceNames
      })
    )
  )((args: any) => {
    const { serviceName, dockerize } = args;
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
  });

  localYargs
    .demandCommand(1, "You need at least one command before moving on")
    .strict()
    .help()
    .fail((err) => {
      console.log('failed!', err);
    })
    .argv;
}

runMain();


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
