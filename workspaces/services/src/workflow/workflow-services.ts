import _ from "lodash";
import { createHubService, createSatelliteService, defineSatelliteService, SatelliteService } from './service-hub';

import { ServiceComm, HandlerSet } from './service-comm';
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
  return createWorkflowHub();
}


const restPortalService = defineSatelliteService<Server>(
  (serviceComm) => startRestPortal(serviceComm), {
  async onShutdown(): Promise<void> {
    putStrLn(`${this.serviceName} [shutdown]> `);
    const server = this.cargo;
    const doClose = promisify(server.close).bind(server);
    return doClose().then(() => {
      putStrLn(`${this.serviceName} [cargo:shutdown]> `);
    });
  }
});

const uploadIngestorService = defineSatelliteService<void>(
  async () => undefined, {
});

const spiderService = defineSatelliteService<void>(
  async () => undefined, {
  //
}
);

const noopService = defineSatelliteService<void>(
  async () => undefined, {
});


const fieldExtractorService = defineSatelliteService<void>(
  async () => undefined, {
});


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


// TODO move to utility module
export type SlidingWindowFunc = <A>(xs: ReadonlyArray<A>) => ReadonlyArray<ReadonlyArray<A>>;
export function sliding(
  window: number,
  offset: number
): SlidingWindowFunc {
  return xs => (
    xs.length < window ? [] :
      [xs.slice(0, window), ...sliding(window, offset)(xs.slice(offset))]
  );
}

export async function createWorkflowHub(): Promise<ServiceComm> {
  const hubPool = await createHubService('hub')

  const orderedServices: WorkflowServiceName[] = [
    'rest-portal',
    'upload-ingestor',
    'spider',
    'field-extractor',
  ];

  const pairWise = sliding(2, 1);
  const servicePairs = pairWise(orderedServices);

  const handlerSet: HandlerSet = {};

  _.each(servicePairs, ([svc1, svc2]) => {
    putStrLn('connecting services', [svc1, svc2]);
    const onEvent = `${svc1}:done`;
    handlerSet[onEvent] = async () => {
      await hubPool.sendTo(`${svc2}`, 'run');
    };
  });

  hubPool.addHandlers('inbox', handlerSet);

  return hubPool;
}
