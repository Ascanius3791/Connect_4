/** Any value that survives `JSON.stringify` followed by `JSON.parse` unchanged. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * A two-way, ordered message link to the other player. Game code only talks to
 * this interface, so the transport (PeerJS today) can be swapped without
 * touching it.
 */
export interface Channel {
  /** True until either side closes the channel. */
  readonly isOpen: boolean;
  /** Sends a value to the other side. Throws if the channel is closed. */
  send(message: JsonValue): void;
  /**
   * Sets the handler for received values, replacing any previous one. Values
   * that arrived before a handler was set are delivered to it right away, in order.
   */
  onMessage(handler: (message: JsonValue) => void): void;
  /**
   * Sets the handler called once when the channel closes, whichever side closed
   * it. Called right away if the channel is already closed.
   */
  onClose(handler: () => void): void;
  /** Closes the channel on both sides. Does nothing if it is already closed. */
  close(): void;
}

/** What a `TransportChannel` needs from the underlying connection. */
export interface Transport {
  send(message: JsonValue): void;
  close(): void;
}

/**
 * Implements the `Channel` bookkeeping (queueing, close reporting) on top of a
 * transport. The transport feeds it with `receive` and `receiveClose`.
 */
export class TransportChannel implements Channel {
  #open = true;
  #closeReported = false;
  #queue: JsonValue[] = [];
  #messageHandler: ((message: JsonValue) => void) | undefined;
  #closeHandler: (() => void) | undefined;
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  send(message: JsonValue): void {
    if (!this.#open) throw new Error('Cannot send: the channel is closed');
    this.#transport.send(message);
  }

  onMessage(handler: (message: JsonValue) => void): void {
    this.#messageHandler = handler;
    const queued = this.#queue;
    this.#queue = [];
    for (const message of queued) handler(message);
  }

  onClose(handler: () => void): void {
    this.#closeHandler = handler;
    if (!this.#open) this.#reportClose();
  }

  close(): void {
    if (!this.#open) return;
    this.#transport.close();
    this.receiveClose();
  }

  /** Called by the transport for each value from the other side. */
  receive(message: JsonValue): void {
    if (!this.#open) return;
    if (this.#messageHandler) this.#messageHandler(message);
    else this.#queue.push(message);
  }

  /** Called by the transport when the connection has ended. */
  receiveClose(): void {
    this.#open = false;
    this.#reportClose();
  }

  #reportClose(): void {
    if (this.#closeReported || !this.#closeHandler) return;
    this.#closeReported = true;
    this.#closeHandler();
  }
}

/**
 * Returns two in-memory channels connected to each other, for tests. Like a
 * real network, delivery is asynchronous (in a microtask), keeps order, and
 * passes values through JSON so no object is shared between the sides.
 */
export function createChannelPair(): [Channel, Channel] {
  const linkTo = (other: () => TransportChannel): Transport => ({
    send(message) {
      const copy = JSON.parse(JSON.stringify(message)) as JsonValue;
      queueMicrotask(() => other().receive(copy));
    },
    close() {
      queueMicrotask(() => other().receiveClose());
    },
  });
  // The links are only followed after both channels exist.
  const a: TransportChannel = new TransportChannel(linkTo(() => b));
  const b: TransportChannel = new TransportChannel(linkTo(() => a));
  return [a, b];
}
