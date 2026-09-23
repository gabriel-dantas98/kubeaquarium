import type { Handler } from './stream';
import type { PodView, StreamEvent } from './types';
import type { DeleteAccepted } from './types';
import type { PodOperations } from './operations';

export const isDemoMode =
  import.meta.env.VITE_KUBEAQUARIUM_DEMO === '1' ||
  new URLSearchParams(location.search).has('demo');

const namespaces = [
  ['bench-web', 42],
  ['bench-payments', 58],
  ['kube-system', 18],
  ['observability', 34],
  ['platform', 26],
  ['data', 24],
] as const;

const reasons = ['', '', '', '', '', 'CrashLoopBackOff', 'ImagePullBackOff', 'Pending'];

export class DemoStream implements PodOperations {
  onConnectionChange?: (connected: boolean) => void;
  private stopped = false;
  private timer?: number;
  private pods = buildDemoPods();
  private generation = 0;
  private handles = new Set<number>();
  private pending = new Set<string>();

  constructor(private handler: Handler) {}

  start() {
    this.stopped = false;
    const generation = ++this.generation;
    window.setTimeout(() => {
      if (this.stopped || generation !== this.generation) return;
      this.onConnectionChange?.(true);
      this.handler({ type: 'snapshot', pods: this.pods });
      this.timer = window.setInterval(() => this.tick(), 1300);
    }, 120);
  }

  stop() {
    this.stopped = true;
    ++this.generation;
    for (const handle of this.handles) window.clearTimeout(handle);
    this.handles.clear(); this.pending.clear();
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.onConnectionChange?.(false);
  }

  async deletePod(pod: PodView): Promise<DeleteAccepted> {
    if (this.stopped || this.pending.has(pod.uid) || !this.pods.some(p => p.uid === pod.uid)) throw new Error('Pod is no longer available');
    this.pending.add(pod.uid);
    const controller = pod.controller;
    this.schedule(400, () => this.emit({ type: 'deleted', uid: pod.uid }));
    if (!controller) return { accepted: true, uid: pod.uid };
    const fixed = pod.uid === 'demo-mission-old';
    const newUid = fixed ? 'demo-mission-new' : `demo-replacement-${pod.uid}-${this.generation}`;
    const newName = fixed ? 'checkout-demo-new' : `${pod.name}-replacement`;
    this.schedule(1200, () => this.emit({ type: 'added', pod: { ...pod, uid: newUid, name: newName, phase: 'Pending', ready: false, reason: '', restartCount: 0, deletionTimestamp: '', createdAt: new Date().toISOString() } }));
    this.schedule(3200, () => { const current = this.pods.find(p => p.uid === newUid); if (current) this.emit({ type: 'updated', pod: { ...current, phase: 'Running', ready: true } }); this.pending.delete(pod.uid); });
    return { accepted: true, uid: pod.uid };
  }

  resetMission() {
    ++this.generation;
    for (const handle of this.handles) window.clearTimeout(handle);
    this.handles.clear(); this.pending.clear(); this.pods = buildDemoPods();
    if (!this.stopped) this.handler({ type: 'snapshot', pods: this.pods });
  }

  private schedule(delay: number, callback: () => void) {
    const generation = this.generation;
    const handle = window.setTimeout(() => { this.handles.delete(handle); if (!this.stopped && generation === this.generation) callback(); }, delay);
    this.handles.add(handle);
  }

  private emit(event: StreamEvent) {
    if (event.type === 'added' || event.type === 'updated') {
      const i = this.pods.findIndex(p => p.uid === event.pod.uid);
      if (i < 0) this.pods.push(event.pod); else this.pods[i] = event.pod;
    } else if (event.type === 'deleted') this.pods = this.pods.filter(p => p.uid !== event.uid);
    this.handler(event);
  }

  private tick() {
    if (this.stopped || this.pods.length === 0) return;
    const mutable = this.pods.map((p, i) => ({p, i})).filter(({p}) => !p.uid.startsWith('demo-mission-'));
    if (!mutable.length) return;
    const i = mutable[Math.floor(Math.random() * mutable.length)].i;
    const pod = { ...this.pods[i] };
    pod.restartCount += pod.reason ? 1 : 0;
    pod.cpuMillis = Math.max(20, pod.cpuMillis + Math.round((Math.random() - 0.45) * 70));
    pod.memMib = Math.max(24, pod.memMib + Math.round((Math.random() - 0.45) * 32));
    this.pods[i] = pod;
    this.handler({ type: 'updated', pod });
  }
}

export function demoContexts() {
  return [{ name: 'demo-github-pages', cluster: 'static-demo', namespace: '', current: true }];
}

export function demoEvents(p: PodView) {
  const now = new Date();
  const warning = p.reason || p.phase === 'Pending';
  return [
    {
      lastSeen: new Date(now.getTime() - 32_000).toISOString(),
      type: warning ? 'Warning' : 'Normal',
      reason: p.reason || 'Ready',
      message: warning
        ? `Demo pod ${p.name} is showing ${p.reason || p.phase} so it stands out in the aquarium.`
        : `Demo pod ${p.name} is running and ready.`,
      source: 'kubeaquarium-demo',
      count: warning ? p.restartCount + 2 : 1,
    },
    {
      lastSeen: new Date(now.getTime() - 240_000).toISOString(),
      type: 'Normal',
      reason: 'Scheduled',
      message: `Assigned ${p.namespace}/${p.name} to ${p.node}.`,
      source: 'default-scheduler',
      count: 1,
    },
  ];
}

export function demoYaml(p: PodView) {
  return [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    `  name: ${p.name}`,
    `  namespace: ${p.namespace}`,
    '  labels:',
    '    app.kubernetes.io/part-of: kubeaquarium-demo',
    'spec:',
    `  nodeName: ${p.node}`,
    '  containers:',
    '    - name: app',
    '      image: ghcr.io/gabriel-dantas98/kubeaquarium-demo:latest',
    '      resources:',
    '        requests:',
    `          cpu: ${p.cpuMillis}m`,
    `          memory: ${p.memMib}Mi`,
    'status:',
    `  phase: ${p.phase}`,
    `  reason: ${p.reason || 'Ready'}`,
    `  ready: ${p.ready}`,
    '',
  ].join('\n');
}

export function demoContainers() {
  return ['app', 'sidecar'];
}

export function demoLogs(p: PodView, container: string) {
  const lines = [
    `[demo] streaming logs for ${p.namespace}/${p.name}`,
    `[demo] container=${container || 'app'} node=${p.node}`,
    `[demo] cpu=${p.cpuMillis}m mem=${p.memMib}Mi restarts=${p.restartCount}`,
    p.reason ? `[warn] current reason=${p.reason}` : '[info] request handled in 42ms',
    '[info] aquarium telemetry heartbeat ok',
    '',
  ];
  return lines.join('\n');
}

function buildDemoPods(): PodView[] {
  const pods: PodView[] = [{ uid: 'demo-mission-old', name: 'checkout-demo-old', namespace: 'bench-payments', node: 'demo-node-1', phase: 'Running', ready: false, restartCount: 5, reason: 'CrashLoopBackOff', cpuMillis: 80, memMib: 128, createdAt: new Date(Date.now() - 120000).toISOString(), deletionTimestamp: '', controller: { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'checkout-demo', uid: 'demo-rs-checkout' } }];
  let seq = 0;
  for (const [namespace, count] of namespaces) {
    for (let i = 0; i < count; i++) {
      const reason = reasons[(seq * 7 + i) % reasons.length];
      const pending = reason === 'Pending';
      const phase = pending ? 'Pending' : reason ? 'Running' : 'Running';
      pods.push({
        uid: `demo-${namespace}-${i}`,
        name: `${pickName(namespace, i)}-${hashSuffix(seq)}`,
        namespace,
        node: `demo-node-${(seq % 5) + 1}`,
        phase,
        ready: !reason,
        restartCount: reason && !pending ? (seq % 6) + 1 : 0,
        reason: pending ? '' : reason,
        cpuMillis: 40 + ((seq * 37) % 900),
        memMib: 48 + ((seq * 53) % 1024),
        createdAt: new Date(Date.now() - (seq + 1) * 97_000).toISOString(),
        deletionTimestamp: '',
        controller: { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: pickName(namespace, i), uid: `demo-controller-${namespace}-${i}` },
      });
      seq++;
    }
  }
  return pods;
}

function pickName(namespace: string, i: number) {
  const stem = namespace.replace(/^bench-/, '');
  const kinds = ['api', 'worker', 'scheduler', 'cache', 'sleeper', 'gateway'];
  return `${stem}-${kinds[i % kinds.length]}`;
}

function hashSuffix(n: number) {
  return (n * 2654435761 >>> 0).toString(16).slice(0, 8);
}
