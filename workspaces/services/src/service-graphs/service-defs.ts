
export type Thunk = () => Promise<void>;
export type HandlerInstance<This, R=unknown> = (this: This, msg: Message) => Promise<R>;

// export type HandlerInstance<This, A=unknown, B = unknown> = (this: This, a: A) => Promise<B>;
export type HandlerSet<This> = Record<string, HandlerInstance<This>>;

// export type HandlerSets = Record<HandlerScope, HandlerSet[]>;
// export type HandlerSets<This> = HandlerSet<This>[];

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


export type Payload =
  Forward
  | MEvent
  | Empty
  ;

export interface Headers {
  from: string;
  to: string;
  // scope: HandlerScope;
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
