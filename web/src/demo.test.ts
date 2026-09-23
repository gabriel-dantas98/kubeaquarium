import { DemoStream } from './demo';
import type { PodView, StreamEvent } from './types';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

type Timer = { due: number; callback: () => void };

export async function runDemoTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  let now = 0;
  let nextId = 1;
  let fetches = 0;
  const timers = new Map<number, Timer>();
  const intervals = new Set<number>();
  const advance = (milliseconds: number) => {
    const end = now + milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].due;
      due[1].callback();
    }
    now = end;
  };

  try {
    globalThis.fetch = (async () => { fetches++; throw new Error('demo must not fetch'); }) as typeof fetch;
    window.setTimeout = ((callback: TimerHandler, delay = 0) => {
      const id = nextId++;
      timers.set(id, { due: now + Number(delay), callback: callback as () => void });
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => { if (id !== undefined) timers.delete(id); }) as typeof window.clearTimeout;
    window.setInterval = (() => {
      const id = nextId++;
      intervals.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => { if (id !== undefined) intervals.delete(id); }) as typeof window.clearInterval;

    const events: StreamEvent[] = [];
    const stream = new DemoStream(event => events.push(event));
    stream.start();
    advance(120);
    const snapshot = events.at(-1);
    assert(snapshot?.type === 'snapshot', 'demo starts with a snapshot');
    const target = snapshot.pods.find(pod => pod.uid === 'demo-mission-old') as PodView;
    assert(target?.name === 'checkout-demo-old' && target.controller?.uid === 'demo-rs-checkout', 'mission target is fixed');

    const accepted = await stream.deletePod(target);
    assert(accepted.accepted && fetches === 0, 'simulated deletion does not fetch');
    await assertRejects(() => stream.deletePod(target), 'double delete is rejected');

    const beforeReset = events.length;
    stream.resetMission();
    advance(4000);
    assert(events.length === beforeReset + 1 && events.at(-1)?.type === 'snapshot', 'pending reset cancels every stale deleted, added, and updated event');

    await completeMissionCycle(stream, events, advance);
    stream.resetMission();
    await completeMissionCycle(stream, events, advance);
    assert(fetches === 0, 'two complete simulated mission cycles never fetch');

    stream.resetMission();
    const thirdTarget = missionTarget(events);
    await stream.deletePod(thirdTarget);
    const beforeStop = events.length;
    stream.stop();
    advance(4000);
    assert(events.length === beforeStop, 'stop prevents all pending recovery events');
    assert(intervals.size === 0, 'stop clears the common demo tick');
  } finally {
    globalThis.fetch = originalFetch;
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
  }
}

async function completeMissionCycle(stream: DemoStream, events: StreamEvent[], advance: (milliseconds: number) => void): Promise<void> {
  const target = missionTarget(events);
  await stream.deletePod(target);
  advance(400);
  assert(events.at(-1)?.type === 'deleted', 'target deletion is observed after 400ms');
  advance(800);
  const added = events.at(-1);
  assert(added?.type === 'added' && added.pod.uid === 'demo-mission-new' && !added.pod.ready, 'replacement arrives Pending after 1200ms');
  advance(2000);
  const ready = events.at(-1);
  assert(ready?.type === 'updated' && ready.pod.uid === 'demo-mission-new' && ready.pod.ready, 'replacement becomes Ready after 3200ms');
}

function missionTarget(events: StreamEvent[]): PodView {
  const snapshot = [...events].reverse().find((event): event is Extract<StreamEvent, { type: 'snapshot' }> => event.type === 'snapshot');
  const target = snapshot?.pods.find(pod => pod.uid === 'demo-mission-old');
  if (!target) throw new Error('mission reset did not restore its target');
  return target;
}

async function assertRejects(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
    throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.message === message) throw error;
  }
}
