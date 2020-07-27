import _ from "lodash";
import { createHubService, createSatelliteService, defineSatelliteService, SatelliteService } from './service-hub';

import { ServiceComm, HandlerSet, getWorkflowServiceLogger } from './service-comm';

import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';
import { Server } from 'http';
import { promisify } from 'util';
import { createSpiderService, SpiderService } from '~/spidering/spider-service';

const log = getWorkflowServiceLogger();

interface WorkflowServiceNames {
  'rest-portal': null;
  'upload-ingestor': null;
  'spider': null;
  'field-extractor': null;
  // 'field-bundler': null; <- create aggregated sets of extracted fields
}

type WorkflowServiceName = keyof WorkflowServiceNames;

export const WorkflowServiceNames: WorkflowServiceName[] = [
  'rest-portal',
  'upload-ingestor',
  'spider',
  'field-extractor',
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
    log.debug(`${this.serviceName} [shutdown]> `)

    const server = this.cargo;
    const doClose = promisify(server.close).bind(server);
    return doClose().then(() => {
      log.debug(`${this.serviceName} [server:shutdown]> `)
    });
  }
});

const uploadIngestorService = defineSatelliteService<void>(
  async () => undefined, {
  async onRun(): Promise<void> {
    // TODO put alpha request records into database
    // TODO setup spider scheduler
    return;
  }
});

const spiderService = defineSatelliteService<SpiderService>(
  async () => createSpiderService(), {
  async onRun(): Promise<void> {
    const spider = this.cargo;
    // const urls = await db.getUnspideredUrls()
    // const metadataStream = await spider.run(urls)
    // update db.urls with metadata
    // await this.getServiceComm().sendTo('hub', 'step')
  },
  async onShutdown(): Promise<void> {
    log.debug(`${this.serviceName} [shutdown]> `)
    const spider = this.cargo;
    return spider.scraper.quit()
      .then(() => {
        log.debug(`${this.serviceName} [scraper:shutdown]> `)
      });
  }
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
    log.info(`connecting services ${svc1} => ${svc2}`);
    const onEvent = `${svc1}:done`;
    handlerSet[onEvent] = async () => {
      await hubPool.sendTo(`${svc2}`, 'run');
    };
  });

  hubPool.addHandlers('inbox', handlerSet);

  return hubPool;
}
