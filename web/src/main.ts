import { AquariumScene } from './scene';
import { PodStore, Stream } from './stream';
import { DetailPanel } from './hud/detail';
import { SearchHUD, ALL, type Filter } from './hud/search';
import { LabelLayer } from './hud/labels';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new AquariumScene(canvas);
const detail = new DetailPanel();
const labels = new LabelLayer();

const store = new PodStore();

const search = new SearchHUD({
  onChange: (filter, raw) => applyFilter(filter, raw),
  onSubmit: () => {
    const uid = scene.firstMatchUid();
    if (uid) {
      const p = store.pods.get(uid);
      if (p) {
        scene.focusOnPod(uid);
        scene.setFocused(uid);
        detail.show(p);
      }
    }
  },
});

let activeFilter: Filter = ALL;
let activeQuery = '';

function applyFilter(filter: Filter, raw: string) {
  activeFilter = filter;
  activeQuery = raw;
  scene.setFilter(filter, raw.trim().length > 0, store.pods);
  search.setCount(scene.countMatched(), store.pods.size, raw.trim().length > 0);
}

const stream = new Stream((ev) => {
  store.apply(ev);
  reconcile();
  if (ev.type === 'deleted') {
    scene.removePod(ev.uid);
    if (detail.isOpenFor(ev.uid)) {
      detail.hide();
      scene.setFocused(null);
    }
  } else if (ev.type === 'updated' || ev.type === 'added') {
    if (detail.isOpenFor(ev.pod.uid)) detail.show(ev.pod);
  }
});
stream.onConnectionChange = (ok) => {
  document.getElementById('ws-dot')?.classList.toggle('live', ok);
  connected = ok;
  updateEmptyState();
};
document.getElementById('ws-dot')!.classList.remove('live');

scene.onSelect = (uid) => {
  const p = store.pods.get(uid);
  if (!p) return;
  scene.setFocused(uid);
  detail.show(p);
};

// Hook DetailPanel close to release focus
const origHide = detail.hide.bind(detail);
detail.hide = () => {
  origHide();
  scene.setFocused(null);
};

// Esc closes detail (and releases the freeze) when not in fly mode / search
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('detail')?.classList.contains('hidden')) {
      detail.hide();
    }
  }
});

scene.start();
stream.start();

// Animation loop for label layer (runs in sync with rAF naturally via the scene clock).
function labelLoop() {
  labels.render(scene.getLabelTargets() as any);
  requestAnimationFrame(labelLoop);
}
requestAnimationFrame(labelLoop);

fetch('/api/contexts').then(r => r.json()).then((list: any[]) => {
  const cur = list.find(c => c.current);
  document.getElementById('ctx-name')!.textContent = cur ? cur.name : (list[0]?.name ?? '—');
});

function reconcile() {
  const counts = new Map<string, number>();
  for (const p of store.pods.values()) {
    counts.set(p.namespace, (counts.get(p.namespace) ?? 0) + 1);
  }
  scene.rebuildNamespaceBubbles(counts);

  const ns2idx = new Map<string, number>();
  for (const p of store.pods.values()) {
    scene.upsertPod(p, ns2idx);
  }

  document.getElementById('pod-count')!.textContent = `${store.pods.size} pods`;
  if (activeQuery.trim().length > 0) {
    scene.setFilter(activeFilter, true, store.pods);
    search.setCount(scene.countMatched(), store.pods.size, true);
  } else {
    search.setCount(0, store.pods.size, false);
  }
  updateEmptyState();
}

let connected = false;
function updateEmptyState() {
  const empty = document.getElementById('empty-state')!;
  const msg = document.getElementById('empty-msg')!;
  if (store.pods.size > 0) {
    empty.classList.add('hidden');
    return;
  }
  empty.classList.remove('hidden');
  msg.textContent = connected
    ? 'No pods to show in this context. Once workloads are created they will swim in.'
    : 'Connecting to your cluster…';
}

const cross = document.createElement('div');
cross.className = 'crosshair';
document.body.appendChild(cross);

(window as any).__kubeaquarium = {
  get fps() { return Math.round(scene.fpsAvg); },
  get pods() { return store.pods.size; },
  get matched() { return scene.countMatched(); },
  pause() { scene.paused = true; },
  resume() { scene.paused = false; },
};
console.log('[kubeaquarium] ready');
