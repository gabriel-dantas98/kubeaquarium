import { ApiDeleteError, LivePodOperations } from './operations';
import type { PodView } from './types';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function runOperationsTests() {
  const originalFetch = globalThis.fetch;
  const pod = { uid: 'u', name: 'pod/name', namespace: 'team space' } as PodView;
  try {
    let seen = '';
    globalThis.fetch = (async (input) => { seen = String(input); return new Response(JSON.stringify({ accepted: true, uid: 'u' }), { status: 202 }); }) as typeof fetch;
    await new LivePodOperations().deletePod(pod);
    assert(seen === '/api/pod/team%20space/pod%2Fname?uid=u', 'DELETE path encodes namespace, name, and uid');
    for (const status of [403, 404, 409, 500]) {
      globalThis.fetch = (async () => new Response('server says no', { status })) as typeof fetch;
      try { await new LivePodOperations().deletePod(pod); throw new Error('missing HTTP failure'); }
      catch (error) { assert(error instanceof ApiDeleteError && error.status === status && error.message === 'server says no', 'HTTP status is preserved'); }
    }
    globalThis.fetch = (async () => new Response(JSON.stringify({ accepted: true, uid: 'other' }), { status: 202 })) as typeof fetch;
    await assertRejects(() => new LivePodOperations().deletePod(pod), 'accepted UID mismatch fails');
    globalThis.fetch = (async () => { throw new TypeError('network down'); }) as typeof fetch;
    await assertRejects(() => new LivePodOperations().deletePod(pod), 'fetch rejection passes through for uncertain tracker state');
  } finally { globalThis.fetch = originalFetch; }
}
async function assertRejects(action: () => Promise<unknown>, message: string) {
  try { await action(); throw new Error(message); } catch (error) { if (error instanceof Error && error.message === message) throw error; }
}
