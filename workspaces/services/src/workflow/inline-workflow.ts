import _ from 'lodash';

import path from 'path';

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
import { extractFieldsForEntry, getExtractedField } from '~/extract/run-main';
import { makeHashEncodedPath } from '~/utils/hash-encoded-paths';

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

export interface RecordRequest {
  kind: 'record-request';
  alphaRec: AlphaRecord;
}
export const RecordRequest =
  (alphaRec: AlphaRecord): RecordRequest => ({
    kind: 'record-request',
    alphaRec
  });

export interface FieldResponse {
  kind: 'field-response';
  alphaRec: AlphaRecord;
}

export type WorkflowData =
  RecordRequest
  ;

function getWorkingDir(): string {
  const appSharePath = process.env['APP_SHARE_PATH'];
  const workingDir = appSharePath ? appSharePath : 'app-share.d';
  return workingDir;
}

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
    async run(data: WorkflowData): Promise<WorkflowData> {
      const workingDir = getWorkingDir();
      this.log.info(`[run]> ${data.kind}; working dir = ${workingDir}`)

      const { alphaRec } = data;
      // if we have the data on disk, just return it
      const downloadDir = path.resolve(workingDir, 'downloads.d');

      getExtractedField(downloadDir, alphaRec);
      return data;
    },
  }),

  'Spider': defineSatelliteService<SpiderService>(
    async () => createSpiderService(getWorkingDir()), {
    async run(data: WorkflowData): Promise<WorkflowData> {
      this.log.info(`[run]> ${data.kind}`)
      const { alphaRec } = data;
      const spider = this.cargo;
      const nextUrl = alphaRec.url;

      const metadata = await spider
        .scrape(nextUrl)
        .catch((error: Error) => {
          putStrLn('Error', error.name, error.message);
          return undefined;
        });

      // return metadata;

      return data;
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
    async run(data: WorkflowData): Promise<WorkflowData> {
      this.log.info(`[run]> ${data.kind}`)
      const { alphaRec } = data;
      const { url } = alphaRec;

      const workingDir = getWorkingDir();
      const corpusRoot = path.resolve(workingDir, 'downloads.d');
      const entryEncPath = makeHashEncodedPath(url, 3);
      const entryPath = entryEncPath.toPath();
      const entryFullpath = path.resolve(corpusRoot, entryPath);
      await extractFieldsForEntry(entryFullpath, this.log)
      return data;
    },
  }),

  'FieldBundler': defineSatelliteService<void>(
    async () => undefined, {
    async run(data: WorkflowData): Promise<WorkflowData> {
      this.log.info(`[run]> ${data.kind}`)

      const workingDir = getWorkingDir();
      const corpusRoot = path.resolve(workingDir, 'downloads.d');

      this.log.info(`[run]> ${data.kind}; working dir = ${corpusRoot}`)

      const { alphaRec } = data;
      // if we have the data on disk, just return it
      getExtractedField(corpusRoot, alphaRec);

      return data;
    },
  }),
};

export async function runServiceHub(
  hubName: string,
  dockerize: boolean,
  orderedServices: string[]
): Promise<[ServiceHub, () => Promise<void>]> {
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
