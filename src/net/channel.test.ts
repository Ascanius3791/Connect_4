import { describe, expect, it, vi } from 'vitest';
import { createChannelPair, type Channel, type JsonValue } from './channel';

/** Waits until all queued deliveries have happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function collect(channel: Channel): JsonValue[] {
  const received: JsonValue[] = [];
  channel.onMessage((message) => received.push(message));
  return received;
}

describe('createChannelPair', () => {
  it('delivers messages to the other side in order', async () => {
    const [a, b] = createChannelPair();
    const atB = collect(b);
    const atA = collect(a);
    a.send(1);
    a.send('two');
    b.send({ reply: [true, null] });
    a.send({ column: 3, nested: { list: [1, 2] } });
    await settle();
    expect(atB).toEqual([1, 'two', { column: 3, nested: { list: [1, 2] } }]);
    expect(atA).toEqual([{ reply: [true, null] }]);
  });

  it('delivers asynchronously, not inside send', async () => {
    const [a, b] = createChannelPair();
    const atB = collect(b);
    a.send('hello');
    expect(atB).toEqual([]);
    await settle();
    expect(atB).toEqual(['hello']);
  });

  it('delivers a copy, not the sent object', async () => {
    const [a, b] = createChannelPair();
    const atB = collect(b);
    const sent = { list: [1] };
    a.send(sent);
    sent.list.push(2);
    await settle();
    expect(atB).toEqual([{ list: [1] }]);
    expect(atB[0]).not.toBe(sent);
  });

  it('keeps messages that arrive before a handler is set', async () => {
    const [a, b] = createChannelPair();
    a.send(1);
    a.send(2);
    await settle();
    const atB = collect(b);
    expect(atB).toEqual([1, 2]);
    a.send(3);
    await settle();
    expect(atB).toEqual([1, 2, 3]);
  });

  it('delivers only to the latest handler', async () => {
    const [a, b] = createChannelPair();
    const first = collect(b);
    const second = collect(b);
    a.send('x');
    await settle();
    expect(first).toEqual([]);
    expect(second).toEqual(['x']);
  });

  it('reports closing on both sides, once each', async () => {
    const [a, b] = createChannelPair();
    const closedA = vi.fn();
    const closedB = vi.fn();
    a.onClose(closedA);
    b.onClose(closedB);
    a.close();
    expect(a.isOpen).toBe(false);
    expect(closedA).toHaveBeenCalledOnce();
    await settle();
    expect(b.isOpen).toBe(false);
    expect(closedB).toHaveBeenCalledOnce();
    a.close();
    b.close();
    await settle();
    expect(closedA).toHaveBeenCalledOnce();
    expect(closedB).toHaveBeenCalledOnce();
  });

  it('reports closing to a handler set after the channel closed', async () => {
    const [a, b] = createChannelPair();
    b.close();
    await settle();
    const closed = vi.fn();
    a.onClose(closed);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('delivers messages sent before closing, then reports the close', async () => {
    const [a, b] = createChannelPair();
    const events: string[] = [];
    b.onMessage((message) => events.push(String(message)));
    b.onClose(() => events.push('closed'));
    a.send('last move');
    a.close();
    await settle();
    expect(events).toEqual(['last move', 'closed']);
  });

  it('throws when sending after close, on either side', async () => {
    const [a, b] = createChannelPair();
    a.close();
    expect(() => a.send('late')).toThrow(/closed/);
    await settle();
    expect(() => b.send('late')).toThrow(/closed/);
  });

  it('starts open on both sides', () => {
    const [a, b] = createChannelPair();
    expect(a.isOpen).toBe(true);
    expect(b.isOpen).toBe(true);
  });
});
