import _ from 'lodash';

import { newServiceComm, ServiceComm } from './service-comm';
import { delay, slidingWindow } from 'commons';
import winston from 'winston';
import Async from 'async';
import { Ack, Address, Dispatch, DispatchHandler, DispatchHandlers, Message, MessageBody, Ping, Quit } from './service-defs';

export type LifecycleName = keyof {
  startup: null,
  shutdown: null,
  step: null,
  run: null,
};

export type LifecycleHandlers<CargoT> = Record<LifecycleName, DispatchHandler<SatelliteService<CargoT>>>;


export interface SatelliteServiceDef<CargoT> {
  cargoInit: (sc: ServiceComm<SatelliteService<CargoT>>) => Promise<CargoT>;
  lifecyleHandlers: DispatchHandlers<SatelliteService<CargoT>>;
}

export type SatelliteServiceComm<CargoT> = ServiceComm<SatelliteService<CargoT>>;

export interface SatelliteService<CargoT> {
  serviceName: string;
  hubName: string;
  commLink: ServiceComm<SatelliteService<CargoT>>;
  sendHub(msg: MessageBody): Promise<void>;
  log: winston.Logger;
  cargo: CargoT;
}

export interface ServiceHub {
  name: string;
  commLink: ServiceComm<ServiceHub>;
  addSatelliteServices(): Promise<void>;
  shutdownSatellites(): Promise<void>;
}


export function defineSatelliteService<CargoT>(
  cargoInit: (sc: ServiceComm<SatelliteService<CargoT>>) => Promise<CargoT>,
  lifecyleHandlers: DispatchHandlers<SatelliteService<CargoT>>
): SatelliteServiceDef<CargoT> {
  return {
    cargoInit,
    lifecyleHandlers
  };
}


export async function createSatelliteService<T>(
  hubName: string,
  satelliteName: string,
  serviceDef: SatelliteServiceDef<T>
): Promise<SatelliteService<T>> {

  const commLink = newServiceComm<SatelliteService<T>>(satelliteName);

  commLink.addDispatches(serviceDef.lifecyleHandlers);

  return serviceDef
    .cargoInit(commLink)
    .then(async (cargo) => {
      const logLevel =
        process.env['${satelliteName}.loglevel']
        || process.env['service-comm.loglevel']
        || 'info';

      const satService: SatelliteService<T> = {
        ...serviceDef.lifecyleHandlers,
        serviceName: satelliteName,
        hubName,
        async sendHub(message: MessageBody): Promise<void> {
          return commLink.send(
            Message.address(message, { from: satelliteName, to: hubName })
          );
        },
        log: commLink.log.child({
          level: logLevel
        }),
        commLink,
        cargo,
      };

      await commLink.connect(satService);

      commLink.addHandlers({
        async ping(msg) {

          return this.sendHub(Ack.create(msg));
        },
        async push(msg) {
          if (msg.kind !== 'push') return;
          return this.sendHub(msg.msg);
        },
        async quit(msg) {
          // TODO shutdown cargo?
          return this.sendHub(Ack.create(msg))
            .then(() => commLink.quit())
        },
        // async received(msg) {
        //   return this.sendHub('ack', msg);
        // },
        // async handled(msg) {
        //   return this.sendHub('done', msg);
        // },
        // async shutdown() {
        //   await commLink.quit();
        // }
        // case 'echo':
        //   return satComm.sendHub(`echo~${lm.message}`);
        // case 'yield':
        //   prettyPrint({ msg: 'yielding...', lm });
        //   return satComm.sendHub(`yield~${lm.message}`);
        // case 'yield-back':
        //   prettyPrint({ msg: 'yielding back...', lm });
        //   return satComm.sendHub(`yield-back~${lm.message}`);

      });


      // await runHandler('startup');

      return satService;
    });
}

async function messageAllSatellites(
  hubComm: ServiceComm<ServiceHub>,
  satelliteNames: string[],
  msg: MessageBody
): Promise<void> {
  const pinged: string[] = [];
  hubComm.addHandlerDefs([
    [`ack/${msg.kind}`, async function(msg: Message & Address) {
      hubComm.log.debug(`${hubComm.name} got ${msg.kind} from satellite ${msg.from}`);
      pinged.push(msg.from);
    }]
  ]);

  const allPinged = () => _.every(satelliteNames, n => pinged.includes(n));
  const unpinged = () => _.filter(satelliteNames, n => !pinged.includes(n));
  const tryPing: () => Promise<void> = async () => {
    if (allPinged()) {
      return;
    }
    const remaining = unpinged();
    hubComm.log.info(`${hubComm.name} sending ${msg.kind} to remaining satellites: ${_.join(remaining, ', ')}`);
    await Async.each(
      remaining,
      async satelliteName => hubComm.send(Message.address(msg, { to: satelliteName }))
    );

    return delay(200).then(async () => {
      return tryPing();
    });
  };
  return tryPing();
}

export async function createHubService(
  hubName: string,
  orderedServices: string[]
): Promise<[ServiceHub, Promise<void>]> {

  const hubService: ServiceHub = {
    name: hubName,
    commLink: newServiceComm(hubName),
    async addSatelliteServices(): Promise<void> {
      await messageAllSatellites(this.commLink, orderedServices, Ping);
    },
    async shutdownSatellites(): Promise<void> {
      await messageAllSatellites(this.commLink, orderedServices, Quit);
    }
  };
  await hubService.commLink.connect(hubService);

  const connectedPromise: Promise<void> = hubService.addSatelliteServices()
    .then(async () => {

      const pairWise = slidingWindow(2);
      const servicePairs = pairWise(orderedServices);
      const firstService = _.first(orderedServices);
      const lastService = _.last(orderedServices);

      if (firstService === undefined || lastService === undefined) {
        return;
      }

      _.each(servicePairs, ([svc1, svc2]) => {
        hubService.commLink.log.info(`connecting services ${svc1} => ${svc2}`);
        hubService.commLink.addHandlerDefs([
          [`${svc1}>yield`, async function(msg) {
            if (msg.kind !== 'yield') return;
            this.commLink.send(Message.address(Dispatch.create('run', msg.value), { to: svc2 }));
          }]
        ]);
      });

      return;
    });

  return [hubService, connectedPromise];
}






// async echoBack(msg: string): Promise<void> {
//   const prefixedMsg = `${satelliteName}:${msg}`;
//   return this.sendHub('echo', `${satelliteName}.inbox`, prefixedMsg);
// },
// async run<A, B>(a: A): Promise<B> {
//   ///
//   return a as any as B;
// },
// async yield<A, B>(a: A): Promise<B> {
//   // serialize a
//   // this.('yield')
//   const responsePromise = new Promise<B>((resolve) => {
//     const responseStream = commLink.subscriber.duplicate();
//     commLink.addHandler(
//       'yield-back',
//       async (msg: Message) => {
//         // const [, ybMsg] = msg.split('~');
//         const dummyResponse = 'todo' as any as B;
//         responseStream.quit()
//           .then(() => resolve(dummyResponse));
//       }
//     );
//   });
//   // const aMsg = `${name}:${a}`;
//   // await commLink.sendSelf('yield', `${satelliteName}.inbox`, aMsg);
//   return responsePromise;
// },

    // TODO allow two-way communication for run/respond

    // hubService.commLink.addHandlers({
    //   async '${svc1}:done~.*'(msg) {
    //     const [, sentMsg] = msg.split(':');
    //     const [, echoedMsg] = sentMsg.split('~');
    //     await hubService.commLink.sendTo(`${svc2}`, echoedMsg);
    //   }
    // });


    // hubService.commLink.addHandler(
    //   `${svc1}:yield~.*`,
    //   async (msg: string) => {
    //     const [, sentMsg] = msg.split(':');
    //     const [, yieldMsg] = sentMsg.split('~');
    //     const runMsg = `run:${yieldMsg}`
    //     await hubService.commLink.sendTo(`${svc2}`, runMsg);
    //   }
    // );

    // hubService.commLink.addHandler(
    //   `${svc2}:yield-back~.*`,
    //   async (msg: string) => {
    //     const [, sentMsg] = msg.split(':');
    //     const [, yieldMsg] = sentMsg.split('~');
    //     const ybMsg = `yield-back:${yieldMsg}`
    //     await hubService.commLink.sendTo(`${firstService}`, ybMsg);
    //   }
    // );


  // hubService.commLink.addHandler(
  //   `${lastService}:run:.*`,
  //   async (msg: string) => {
  //     const [, sentMsg] = msg.split(':');
  //     const [, yieldMsg] = sentMsg.split('~');
  //     const ybMsg = `yield-back~${yieldMsg}`
  //     await hubService.commLink.sendTo(`${firstService}`, ybMsg);
  //   }
  // );
