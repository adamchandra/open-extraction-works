import _ from 'lodash';
import { createHubService, createSatelliteService, defineSatelliteService, SatelliteService, ServiceHub, SatelliteServiceDef } from '~/service-graphs/service-hub';

import { startRestPortal } from '~/http-servers/extraction-rest-portal/rest-server';
import { Server } from 'http';
import { promisify } from 'util';
import { createSpiderService, SpiderService } from '~/spidering/spider-service';
import { commitMetadata, getNextUrlForSpidering, insertCorpusEntry, insertNewUrlChains } from '~/db/db-api';
import { putStrLn } from 'commons';


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

function getWorkingDir(): string {
  const appSharePath = process.env['APP_SHARE_PATH'];
  const workingDir = appSharePath ? appSharePath : 'app-share.d';
  return workingDir;
}

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
      this.log.info('[step]> ')
      await insertNewUrlChains()
    }
  }),

  'Spider': defineSatelliteService<SpiderService>(
    async () => createSpiderService(getWorkingDir()), {
    async step() {
      this.log.info(`${this.serviceName} [step]> `)
      const spider = this.cargo;
      let nextUrl = await getNextUrlForSpidering();
      while (nextUrl !== undefined) {
        const metadata = await spider
          .scrape(nextUrl)
          .catch((error: Error) => {
            putStrLn('Error', error.name, error.message);
            return undefined;
          });

        if (metadata !== undefined) {
          const committedMeta = await commitMetadata(metadata);
          this.log.info(`committing Metadata ${committedMeta}`)
          if (committedMeta) {
            committedMeta.statusCode === 'http:200';
            const corpusEntryStatus = await insertCorpusEntry(committedMeta.url);
            this.log.info(`created new corpus entry ${corpusEntryStatus.entryId}: ${corpusEntryStatus.statusCode}`)
            // await this.commLink.echoBack('step');
          }
        } else {
          putStrLn(`Metadata is undefined for url ${nextUrl}`);
        }
        nextUrl = await getNextUrlForSpidering();
      }
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

export async function runServiceHub(hubName: string, dockerize: boolean, orderedServices: string[]): Promise<[ServiceHub, () => Promise<void>]> {
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
