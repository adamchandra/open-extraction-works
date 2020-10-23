
import { parseJSON, isLeft, toError } from 'fp-ts/lib/Either';

function parseJson(s: string): any | undefined {
  const parsed = parseJSON(s, toError);

  if (isLeft(parsed)) {
    const syntaxError = parsed.left;
    const posRE = /position (\d+)/;
    const posMatch = syntaxError.message.match(posRE);

    if (posMatch && posMatch.length > 1) {
      const errIndex = parseInt(posMatch[1]);
      const begin = Math.max(0, errIndex - 50);
      const end = Math.min(s.length, errIndex + 50);
      const pre = s.slice(begin, errIndex + 1)
      const post = s.slice(errIndex + 1, end)
      console.log(`${syntaxError}\nContext:\n${pre} <-- Error\n${post}`);
    }
    return;
  }
  return parsed.right;
}

export type Thunk = () => Promise<void>;

export type MessageHandler<This> = (this: This, msg: Message) => Promise<Message | void>;
export type MessageHandlers<This> = Record<string, MessageHandler<This>>;

export type DispatchHandler<This, A = unknown, B = unknown> = (this: This, a: A) => Promise<B>;
export type DispatchHandlers<This> = Record<string, DispatchHandler<This>>;

export interface Forward {
  kind: 'forward';
  body: Message
}

export const Forward = {
  create(message: Message): Forward {
    return {
      kind: 'forward',
      body: message
    }
  }
}

export interface MEvent {
  kind: 'event';
  body: string;
}
export const MEvent = {
  create(body: string): MEvent {
    return {
      kind: 'event',
      body
    }
  }
}

export interface Empty {
  kind: 'empty';
}

export interface Dispatch {
  kind: 'dispatch';
  func: string;
  arg: string;
}

export const Dispatch = {
  create(func: string, arg: string): Dispatch {
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


export type Payload =
  Forward
  | MEvent
  | Dispatch
  | Yield
  | Empty
  ;

export interface Headers {
  from: string;
  to: string;
  messageType: string;
}

export interface Message extends Headers {
  channel(): string;
  payload: Payload;
}
export const Message = {
  pack: packMessage,
  unpack: unpackMessage,
  create: newMessage,
}

function packMessage(msg: Message): string {
  const { from, to, messageType } = msg;
  const hdrs = `${from}->${to}.${messageType}`;
  const pld = packPayload(msg.payload);
  return `${hdrs} :: ${pld}`;

}

function unpackMessage(packed: string): Message {
  const divider = packed.indexOf('::')
  const hdrs = packed.substr(0, divider).trim();
  const pld = packed.substr(divider + 2).trim();
  const [from, toScope] = hdrs.split(/->/)
  const [to, messageType] = toScope.split('.')
  const payload = unpackPayload(pld);
  return newMessage({ from, to, messageType }, payload);
}

function newMessage(init: Headers, mpayload?: Payload): Message {
  const payload: Payload = mpayload ? mpayload : { kind: 'empty' };
  return {
    ...init,
    payload,
    channel: () => `${init.to}`
  };
}

export function packPayload(payload: Payload): string {
  switch (payload.kind) {
    case 'event':
      return `evt:${payload.body}`;
    case 'forward': {
      const pmsg = packMessage(payload.body);
      return `fwd:${pmsg}`;
    }
    case 'dispatch': {
      const { func, arg } = payload
      return `dsp:${func}:${arg}`;
    }
    case 'yield': {
      const { value } = payload
      const vstr = JSON.stringify(value);
      return `yld:${vstr}`;
    }
    case 'empty': {
      return 'nil:';
    }
  }
}

export function unpackPayload(packed: string): Payload {
  // putStrLn(`unpackPayload: ${packed}`);
  const prefix = packed.substr(0, 3);
  const body = packed.substr(4);
  switch (prefix) {
    case 'evt': {
      const p: Payload = {
        kind: 'event',
        body
      };
      return p;
    }
    case 'fwd': {
      const p: Payload = {
        kind: 'forward',
        body: unpackMessage(body)
      };
      return p;
    }
    case 'dsp': {
      const divider = body.indexOf(':')
      const func = body.substr(0, divider);
      const arg = body.substr(divider + 1);
      const p: Payload = {
        kind: 'dispatch',
        func,
        arg
      };
      return p;
    }
    case 'yld': {
      const parsed = parseJson(body);
      const p: Payload = {
        kind: 'yield',
        value: parsed
      };
      return p;
    }

    case 'nil': {
      const p: Payload = {
        kind: 'empty',
      };
      return p;
    }
    default:
      throw new Error(`Could not unpack Message payload ${packed}`)
  }
}
