import type { Handler } from './stream';
import type { PodView, StreamEvent } from './types';

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

export class DemoStream {
  onConnectionChange?: (connected: boolean) => void;
  private stopped = false;
  private timer?: number;
  private pods = buildDemoPods();

  constructor(private handler: Handler) {}

  start() {
    window.setTimeout(() => {
      if (this.stopped) return;
      this.onConnectionChange?.(true);
      this.handler({ type: 'snapshot', pods: this.pods });
      this.timer = window.setInterval(() => this.tick(), 1300);
    }, 120);
  }

  stop() {
    this.stopped = true;
    if (this.timer) window.clearInterval(this.timer);
    this.onConnectionChange?.(false);
  }

  private tick() {
    if (this.stopped || this.pods.length === 0) return;
    const i = Math.floor(Math.random() * this.pods.length);
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
  const pods: PodView[] = [];
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
