import _ from "lodash";
import { arglib } from "commons";
import { getHubRedisPool, getSatelliteRedisPool } from './workflow';

const { opt, config, registerCmd } = arglib;

import { putStrLn, delay } from 'commons';

export interface ServiceTasks {
  onStart(): Promise<void>;
}

const serviceNames = [
  'hub',
  'rest-portal',
  'upload-ingestor',
  'field-extractor',
  'spider',
];

const serviceDef: Record<string, ServiceTasks> = {};

function addService(serviceName: string, service: ServiceTasks): void {
  serviceDef[serviceName] = service;
}


export async function createSatelliteService(
  serviceName: string,
  serviceTasks: ServiceTasks
) {
  const servicePool = await getSatelliteRedisPool(serviceName);
  servicePool.handleInbox({
    'start': async () => {
      await serviceTasks.onStart();
    },
  });
}



export async function createHubService() {
  const hubPool = await getHubRedisPool('hub')
  const serviceNames = [
    'rest-portal',
    'upload-ingestor',
    'spider',
    'field-extractor',
  ];

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
  async onStart(): Promise<void> {
    putStrLn(`spider> start`);
    return;
  }
});

addService('upload-ingestor', {
  async onStart(): Promise<void> {
    putStrLn(`upload-ingestor> start`);
    // figure out which urls we know about, which fields, etc.,
    // create a response json detailing what we have/don't have,
    //    and endpoints to download, check status, etc.
    return;
  }
});


registerCmd(
  "start-service",
  "start workflow service hub",
  config(
    opt.cwd,
    opt.ion("service-name: name of service to launch", {
      choices: serviceNames
    })
  )
)(async (args: any) => {
  const { serviceName } = args;
  if (serviceName === 'hub') {
    await createHubService();
    return;
  }
  const serviceTasks = serviceDef[serviceName];
  if (!serviceTasks) {
    putStrLn(`Service Init Error: ${serviceName} not registered`);
    return;
  }
  await createSatelliteService(serviceName, serviceTasks);
});


arglib.YArgs
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .help()
  .fail(() => undefined)
  .argv;


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
