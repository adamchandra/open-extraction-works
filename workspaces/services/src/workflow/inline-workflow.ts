import _ from 'lodash';

import {
  createHubService,
  createSatelliteService,
  defineSatelliteService,
  SatelliteService,
  ServiceHub,
  SatelliteServiceDef
} from '~/service-graphs/service-hub';

import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';
import { Server } from 'http';
import { promisify } from 'util';
import { createSpiderService, SpiderService } from '~/spidering/spider-service';
import { AlphaRecord, putStrLn } from 'commons';
import { Metadata } from '~/spidering/data-formats';

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
    (serviceComm) => startRestPortal(serviceComm),
    {
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
    async run(alphaRec: AlphaRecord): Promise<AlphaRecord> {
      this.log.info(`[run]> ${alphaRec}`)
      return alphaRec;
    },
  }),

  'Spider': defineSatelliteService<SpiderService>(
    async () => createSpiderService(), {
    async run(alphaRec: AlphaRecord): Promise<Metadata | undefined> {
      this.log.info(`[run]> ${alphaRec}`)
      const spider = this.cargo;
      const nextUrl = alphaRec.url;

      const metadata = await spider
        .scrape(nextUrl)
        .catch((error: Error) => {
          putStrLn('Error', error.name, error.message);
          return undefined;
        });
      return metadata;
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
    async run(input: any): Promise<void> {
      this.log.info(`[run]> ${input}`)
    },
  }),

  'FieldBundler': defineSatelliteService<void>(
    async () => undefined, {
    async run(input: any): Promise<void> {
      this.log.info(`[run]> ${input}`)
    },
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
