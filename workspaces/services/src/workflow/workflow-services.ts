import _ from "lodash";
import { createHubService, createSatelliteService, defineSatelliteService, SatelliteService, ServiceHub, SatelliteServiceDef } from './service-hub';

import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';
import { Server } from 'http';
import { promisify } from 'util';
import { createSpiderService, SpiderService } from '~/spidering/spider-service';
import { upsertUrlChains } from '~/db/db-api';

type WorkflowServiceName = keyof {
  RestPortal: null,
  UploadIngestor: null,
  Spider: null,
  FieldExtractor: null,
  FieldBundler: null,
}


export const WorkflowServiceNames: WorkflowServiceName[] = [
  'RestPortal',
  'UploadIngestor',
  'Spider',
  'FieldExtractor',
  'FieldBundler',
];

const registeredServices: Record<WorkflowServiceName, SatelliteServiceDef<any>> = {
  'RestPortal': defineSatelliteService<Server>(
    (serviceComm) => startRestPortal(serviceComm), {
    async shutdown() {
      this.log.debug(`${this.serviceName} [shutdown]> `)

      const server = this.cargo;
      const doClose = promisify(server.close).bind(server);
      return doClose().then(() => {
        this.log.debug(`${this.serviceName} [server:shutdown]> `)
      });
    }
  }),

  'UploadIngestor': defineSatelliteService<void>(
    async () => undefined, {
    async step(): Promise<void> {
      this.log.info(`${this.serviceName} [step]> `)
      // Places new urls requiring spidering into UrlChain Table
      await upsertUrlChains();
      // TODO put alpha request records into database
      return;
    }
  }),

  'Spider': defineSatelliteService<SpiderService>(
    async () => createSpiderService(), {
    async step() {
      this.log.info(`${this.serviceName} [step]> `)
      // TODO get next url to be spidered
      // const spider = this.cargo;
      // const urls = await db.getUnspideredUrls()
      // const metadataStream = await spider.run(urls)
    },
    async shutdown() {
      this.log.debug(`${this.serviceName} [shutdown]> `)
      const spider = this.cargo;
      return spider.scraper.quit()
        .then(() => {
          this.log.debug(`${this.serviceName} [scraper:shutdown]> `)
        });
    }
  }),


  'FieldExtractor': defineSatelliteService<void>(
    async () => undefined, {
  }),

  'FieldBundler': defineSatelliteService<void>(
    async () => undefined, {
  }),
};

export async function runServiceHub(hubName: string, dockerize: boolean, orderedServices: string[]): Promise<[ServiceHub, Promise<void>]> {
  if (dockerize) {
    process.env['DOCKERIZED'] = 'true';
  }
  return createHubService(hubName, orderedServices);
}



export async function runService(
  hubName: string,
  serviceName: WorkflowServiceName,
  dockerize: boolean
): Promise<SatelliteService<any>> {
  if (dockerize) {
    process.env['DOCKERIZED'] = 'true';
  }
  const serviceDef = registeredServices[serviceName]
  return createSatelliteService(hubName, serviceName, serviceDef);
}
