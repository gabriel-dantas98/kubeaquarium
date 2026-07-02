import { AquariumScene } from './scene';
import { PodStore, Stream } from './stream';
import { DetailPanel } from './hud/detail';
import { SearchHUD, ALL, type Filter } from './hud/search';
import { RadarHUD, type RadarItem } from './hud/radar';
import { LabelLayer } from './hud/labels';
import type { PodView, StreamEvent } from './types';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new AquariumScene(canvas);
const detail = new DetailPanel();
const labels = new LabelLayer();
const attackFrame = document.getElementById('attack-frame') as HTMLDivElement;
const attackToggle = document.getElementById('attack-toggle') as HTMLButtonElement;

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

const radar = new RadarHUD({
  getItems: listRadarItems,
  onSelect: selectRadarItem,
});
void radar;

let activeFilter: Filter = ALL;
let activeQuery = '';
let namespaceCounts = new Map<string, number>();
let pendingEvents: StreamEvent[] = [];
let flushScheduled = false;
let attackMode = false;
let lastAttackHitUid: string | null = null;

function applyFilter(filter: Filter, raw: string) {
  activeFilter = filter;
  activeQuery = raw;
  scene.setFilter(filter, raw.trim().length > 0, store.pods);
  search.setCount(scene.countMatched(), store.pods.size, raw.trim().length > 0);
}

function podToRadarItem(p: PodView): RadarItem {
  const status = p.reason || p.phase;
  return {
    id: p.uid,
    kind: 'pod',
    name: p.name,
    namespace: p.namespace,
    status,
    meta: p.node,
    tokens: [
      'pod',
      p.name,
      p.namespace,
      status,
      p.phase,
      p.reason,
      p.node,
    ].filter(Boolean).map(v => v.toLowerCase()),
  };
}

function listRadarItems(): RadarItem[] {
  return [...store.pods.values()].map(podToRadarItem);
}

function selectRadarItem(item: RadarItem) {
  if (item.kind !== 'pod') return;
  const pod = store.pods.get(item.id);
  if (!pod) return;
  scene.focusOnPod(item.id);
  scene.setFocused(item.id);
  detail.show(pod);
}

function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function isInteractive(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest('button,input,select,textarea,a,[role="button"],[role="listbox"],.detail,.radar,.search');
}

function setAttackMode(enabled: boolean) {
  attackMode = enabled;
  scene.setAttackMode(enabled);
  document.body.classList.toggle('attack', enabled);
  attackFrame.classList.toggle('hidden', !enabled);
  attackToggle.classList.toggle('active', enabled);
  attackToggle.setAttribute('aria-pressed', String(enabled));
  attackToggle.title = enabled ? 'Disarm attack mode' : 'Arm attack mode';
}

async function deletePodFromAttackHit(uid: string) {
  if (!attackMode) return;
  const pod = store.pods.get(uid);
  if (!pod) return;
  const url = `/api/pod/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    console.warn('[kubeaquarium] missile delete failed', pod.namespace, pod.name, await res.text());
    return;
  }
  scene.removePod(uid);
}

const stream = new Stream((ev) => {
  pendingEvents.push(ev);
  scheduleFlush();
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
scene.onAttackHit = (uid) => {
  lastAttackHitUid = uid;
  void deletePodFromAttackHit(uid);
};
attackToggle.addEventListener('click', () => setAttackMode(!attackMode));

// Hook DetailPanel close to release focus
const origHide = detail.hide.bind(detail);
detail.hide = () => {
  origHide();
  scene.setFocused(null);
};

// Esc closes detail (and releases the freeze) when not in dive/search.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l' && !isEditing(e.target)) {
    e.preventDefault();
    setAttackMode(!attackMode);
    return;
  }
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

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(flushPendingEvents);
}

function flushPendingEvents() {
  flushScheduled = false;
  if (pendingEvents.length === 0) return;

  const events = pendingEvents;
  pendingEvents = [];
  const changedPods = new Set<string>();
  let needsFullReconcile = false;
  let namespaceLayoutDirty = false;

  for (const ev of events) {
    if (ev.type === 'snapshot') {
      store.apply(ev);
      namespaceCounts = countNamespaces(store.pods.values());
      needsFullReconcile = true;
      namespaceLayoutDirty = true;
      changedPods.clear();
      continue;
    }

    if (ev.type === 'deleted') {
      const previous = store.pods.get(ev.uid);
      store.apply(ev);
      if (previous) {
        decrementNamespace(previous.namespace);
        namespaceLayoutDirty = true;
      }
      changedPods.delete(ev.uid);
      scene.removePod(ev.uid);
      if (detail.isOpenFor(ev.uid)) {
        detail.hide();
        scene.setFocused(null);
      }
      continue;
    }

    const previous = store.pods.get(ev.pod.uid);
    store.apply(ev);
    if (!previous) {
      incrementNamespace(ev.pod.namespace);
      namespaceLayoutDirty = true;
    } else if (previous.namespace !== ev.pod.namespace) {
      decrementNamespace(previous.namespace);
      incrementNamespace(ev.pod.namespace);
      namespaceLayoutDirty = true;
    }
    changedPods.add(ev.pod.uid);
    if (detail.isOpenFor(ev.pod.uid)) detail.show(ev.pod);
  }

  if (namespaceLayoutDirty) {
    scene.rebuildNamespaceBubbles(namespaceCounts);
  }

  const ns2idx = new Map<string, number>();
  if (needsFullReconcile) {
    for (const p of store.pods.values()) scene.upsertPod(p, ns2idx);
  } else {
    for (const uid of changedPods) {
      const p = store.pods.get(uid);
      if (p) scene.upsertPod(p, ns2idx);
    }
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

function countNamespaces(pods: Iterable<PodView>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of pods) {
    counts.set(p.namespace, (counts.get(p.namespace) ?? 0) + 1);
  }
  return counts;
}

function incrementNamespace(namespace: string) {
  namespaceCounts.set(namespace, (namespaceCounts.get(namespace) ?? 0) + 1);
}

function decrementNamespace(namespace: string) {
  const next = (namespaceCounts.get(namespace) ?? 0) - 1;
  if (next > 0) namespaceCounts.set(namespace, next);
  else namespaceCounts.delete(namespace);
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

function moveReticle(clientX: number, clientY: number) {
  const x = Math.max(24, Math.min(window.innerWidth - 24, clientX));
  const y = Math.max(52, Math.min(window.innerHeight - 56, clientY));
  document.body.style.setProperty('--aim-x', `${x}px`);
  document.body.style.setProperty('--aim-y', `${y}px`);
  scene.setAimClientPoint(x, y);
}

moveReticle(window.innerWidth / 2, window.innerHeight / 2);
window.addEventListener('pointermove', (e) => {
  if (!scene.isDiving) return;
  moveReticle(e.clientX, e.clientY);
});
window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !attackMode || !scene.isDiving || isInteractive(e.target)) return;
  moveReticle(e.clientX, e.clientY);
  e.preventDefault();
  e.stopPropagation();
  scene.fireAttack();
}, true);

(window as any).__kubeaquarium = {
  get fps() { return Math.round(scene.fpsAvg); },
  get pods() { return store.pods.size; },
  get matched() { return scene.countMatched(); },
  get attackMode() { return attackMode; },
  get diveMode() { return scene.isDiving; },
  get projectiles() { return scene.projectileCount; },
  get lastAttackHitUid() { return lastAttackHitUid; },
  pause() { scene.paused = true; },
  resume() { scene.paused = false; },
};
(window as any).render_game_to_text = () => JSON.stringify({
  mode: scene.isDiving ? 'dive' : 'orbit',
  attackMode,
  pods: store.pods.size,
  fps: Math.round(scene.fpsAvg),
  projectiles: scene.projectileCount,
  lastAttackHitUid,
  aim: {
    x: getComputedStyle(document.body).getPropertyValue('--aim-x').trim() || '50vw',
    y: getComputedStyle(document.body).getPropertyValue('--aim-y').trim() || '50vh',
  },
});
console.log('[kubeaquarium] ready');
