import _ from "lodash";
import { createHubService, createSatelliteService, defineSatelliteService, SatelliteService } from './service-hub';

import { ServiceComm } from './service-comm';
import { putStrLn } from 'commons';

import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';
import { Server } from 'http';
import { promisify } from 'util';

interface WorkflowServiceNames {
  'rest-portal': null;
  'upload-ingestor': null;
  'field-extractor': null;
  'spider': null;
  'no-op': null;
}

type WorkflowServiceName = keyof WorkflowServiceNames;

export const WorkflowServiceNames: WorkflowServiceName[] = [
  'rest-portal',
  'upload-ingestor',
  'field-extractor',
  'spider',
  'no-op',
];

export async function runServiceHub(dockerize: boolean): Promise<ServiceComm> {
  if (dockerize) {
    process.env['DOCKERIZED'] = 'true';
  }
  return createHubService('hub');
}


const restPortalService = defineSatelliteService<Server>(
  (serviceComm) => startRestPortal(serviceComm), {
  async onStartup(): Promise<void> {
    putStrLn(`${this.serviceName} [startup]> `);
    return;
  },
  async onRun(): Promise<void> {
    putStrLn(`${this.serviceName} [run]> `);
    return;
  },
  async onShutdown(): Promise<void> {
    putStrLn(`${this.serviceName} [shutdown]> `);
    const server = this.cargo;
    const doClose = promisify(server.close).bind(server);
    return doClose().then(() => {
      putStrLn(`${this.serviceName} [cargo:shutdown]> `);
    });
  }
}
);

const spiderService = defineSatelliteService<void>(
  async () => undefined, {
  //
}
);

const noopService = defineSatelliteService<void>(
  async () => undefined, {
}
);

const uploadIngestorService = defineSatelliteService<void>(
  async () => undefined, {
}
);
const fieldExtractorService = defineSatelliteService<void>(
  async () => undefined, {
}
);


export async function runService(
  serviceName: WorkflowServiceName,
  dockerize: boolean
): Promise<SatelliteService<any>> {
  if (dockerize) {
    process.env['DOCKERIZED'] = 'true';
  }
  switch (serviceName) {
    case 'rest-portal':
      return createSatelliteService(serviceName, restPortalService);
    case 'upload-ingestor':
      return createSatelliteService(serviceName, uploadIngestorService);
    case 'field-extractor':
      return createSatelliteService(serviceName, fieldExtractorService);
    case 'spider':
      return createSatelliteService(serviceName, spiderService);
    case 'no-op':
      return createSatelliteService(serviceName, noopService);
  }
}

export async function createWorkflowHub(): Promise<ServiceComm> {
  const hubPool = await createHubService('hub')

  hubPool.addHandlers('inbox', {
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
