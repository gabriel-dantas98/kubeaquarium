import { Stream } from './stream';
import type { StreamEvent } from './types';

type Callback = (() => void) | null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: Callback = null;
  onclose: Callback = null;
  onerror: Callback = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  open() { this.onopen?.(); }
  message(data: string) { this.onmessage?.({ data } as MessageEvent<string>); }
}

export async function runStreamTests(): Promise<void> {
  const originalWebSocket = globalThis.WebSocket;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nextTimer = 1;
  const timers = new Map<number, () => void>();
  const timerCount = () => timers.size;
  const socketCount = () => FakeWebSocket.instances.length;
  const runTimers = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  const events: StreamEvent[] = [];
  const connections: boolean[] = [];
  try {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      const id = nextTimer++;
      timers.set(id, callback as () => void);
      return id;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id?: number) => { if (id !== undefined) timers.delete(id); }) as typeof clearTimeout;

    const stream = new Stream(event => events.push(event));
    stream.onConnectionChange = connected => connections.push(connected);
    stream.start();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.message(JSON.stringify({ type: 'snapshot', pods: [] }));
    first.message('{malformed');
    first.message(JSON.stringify({ type: 'snapshot', pods: 'not-an-array' }));
    if (events.length !== 1 || events[0].type !== 'snapshot' || events[0].pods.length !== 0) throw new Error('empty snapshot or malformed messages');

    first.close();
    if (connections.at(-1) !== false || timerCount() !== 1) throw new Error('close did not schedule reconnect');
    runTimers();
    const second = FakeWebSocket.instances[1];
    if (!second || second === first) throw new Error('reconnect did not create a socket');
    first.message(JSON.stringify({ type: 'deleted', uid: 'stale' }));
    if (events.some(event => event.type === 'deleted' && event.uid === 'stale')) throw new Error('old generation callback was accepted');
    const connectionCount = connections.length;
    first.onclose?.();
    if (timerCount() !== 0 || connections.length !== connectionCount || socketCount() !== 2) throw new Error('old generation close scheduled reconnect');

    stream.stop();
    if (!second.closed || timerCount() !== 0) throw new Error('stop did not close socket and cancel reconnect');
    second.close();
    if (timerCount() !== 0 || socketCount() !== 2) throw new Error('stopped stream reconnected');

    stream.start();
    if (socketCount() !== 3) throw new Error('explicit restart did not reconnect');
    FakeWebSocket.instances[2].open();
    if (connections.filter(Boolean).length !== 2) throw new Error('connection changes were not reported');
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}
