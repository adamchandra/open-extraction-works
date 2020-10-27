import _ from 'lodash';
import { putStrLn, newIdGenerator, parseJson } from 'commons';

export type Thunk = () => Promise<void>;

export type MessageHandler<This> = (this: This, msg: Message & AddrTo & AddrFrom) => Promise<Message & AddrTo | void>;
export type MessageHandlers<This> = Record<string, MessageHandler<This>>;
export type MessageHandlerDef<This> = [string, MessageHandler<This>];

export type DispatchHandler<This, A = any, B = any> = (this: This, a: A) => Promise<B>;
export type DispatchHandlers<This> = Record<string, DispatchHandler<This>>;

const nextId = newIdGenerator(1);

export interface Dispatch {
  kind: 'dispatch';
  func: string;
  arg: any;
}


export const Dispatch = {
  create(func: string, arg: any): Dispatch {
    return {
      kind: 'dispatch',
      func, arg
    };
  }
}

export interface Yield {
  kind: 'yield';
  value: any;
}

export const Yield = {
  create(value: any): Yield {
    return {
      kind: 'yield', value
    };
  }
}

export interface Push {
  kind: 'push';
  msg: MessageBody;
}

export const Push = {
  create(msg: MessageBody): Push {
    return {
      kind: 'push', msg
    };
  }
}

export interface Ack {
  kind: 'ack';
  acked: string;
}

export const Ack = {
  create(msg: MessageBody): Ack {
    return {
      kind: 'ack', acked: msg.kind
    };
  }
}

export type Ping = { kind: 'ping' };
export const Ping: Ping = { kind: 'ping' };

export type Quit = { kind: 'quit' };
export const Quit: Quit = { kind: 'quit' };


export type MessageBody =
  Yield
  | Dispatch
  | Push
  | Ping
  | Quit
  | Ack
  ;




export interface AddrTo {
  to: string;
}

export interface AddrFrom {
  from: string;
}

export type Address = AddrFrom & AddrTo;

export interface Headers extends Address {
  id: number;
}

export type Message = MessageBody & Headers;

export const Message = {
  pack: packMessage,
  unpack: unpackMessage,
  address(body: MessageBody, headers: Partial<Headers>): Message {
    const defaultHeaders: Headers = {
      from: '', to: '', id: 0
    };
    const m: Message = _.merge({}, body, defaultHeaders, headers);
    return m;
  }
}

export function packMessageBody(message: MessageBody): string {
  switch (message.kind) {
    case 'dispatch': {
      const { func, arg } = message;
      const varg = arg === undefined ? '"null"' : JSON.stringify(arg);
      return `dispatch/${func}:${varg}`;
    }
    case 'yield': {
      const { value } = message;
      const vstr = JSON.stringify(value);
      return `yield/${vstr}`;
    }
    case 'push': {
      const { msg } = message;
      const vstr = packMessageBody(msg);
      return `push/${vstr}`;
    }
    case 'ping': {
      return 'ping';
    }
    case 'ack': {
      const { acked } = message;
      return `ack/${acked}`;
    }
    case 'quit': {
      return 'quit';
    }
  }
}

export function unpackMessageBody(packedMessage: string): MessageBody {
  const slashIndex = packedMessage.indexOf('/')
  let msgKind = packedMessage;
  let body = '';

  if (slashIndex > 0) {
    msgKind = packedMessage.substr(0, slashIndex);
    body = packedMessage.substr(slashIndex + 1);
  }

  let unpackedMsg: MessageBody;

  switch (msgKind) {
    case 'dispatch': {
      const divider = body.indexOf(':')
      const func = body.substr(0, divider);
      const argstr = body.substr(divider + 1);
      const arg = parseJson(argstr);
      unpackedMsg = {
        kind: msgKind,
        func,
        arg
      };
      break;
    }
    case 'yield': {
      unpackedMsg = {
        kind: msgKind,
        value: parseJson(body)
      };
      break;
    }
    case 'push': {
      unpackedMsg = {
        kind: msgKind,
        msg: unpackMessageBody(body)
      };
      break;
    }

    case 'ack': {
      unpackedMsg = {
        kind: msgKind,
        acked: body
      };
      break;
    }
    case 'ping':
    case 'quit':
      unpackedMsg = {
        kind: msgKind,
      };
      break;
    default:
      putStrLn(`Default:Could not unpack Message ${packedMessage}`);
      throw new Error(`Could not unpack Message payload ${packedMessage}`)
  }

  return unpackedMsg;
}

export function updateHeaders(message: Message, headers: Partial<Headers>): Message {
  return _.assign(message, headers);
}


export function unpackHeaders(headers: string): Headers {
  const [ids, to, from] = headers.split(/:/)
  const id = parseInt(ids, 10);
  return { id, to, from };
}
export function packHeaders(message: Message): string {
  const { from, to, id } = message;
  const hdrs = `${id}:${to}:${from}>`;
  return hdrs;
}

export function packMessage(message: Message): string {
  const hdrs = packHeaders(message);
  const pmsg = packMessageBody(message);
  return `${hdrs}${pmsg}`;
}


export function unpackMessage(packed: string): Message & Address {
  const divider = packed.indexOf('>')
  const hdrs = packed.substr(0, divider).trim();
  const message = packed.substr(divider + 1).trim();

  const headers: Headers = unpackHeaders(hdrs);
  const body: MessageBody = unpackMessageBody(message);

  return ({
    ...headers,
    ...body
  });
}
