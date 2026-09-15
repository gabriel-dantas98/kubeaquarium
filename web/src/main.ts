import { AquariumScene } from './scene';
import { PodStore, Stream } from './stream';
import { DetailPanel } from './hud/detail';
import { SearchHUD, ALL, type Filter } from './hud/search';
import { RadarHUD, type RadarItem } from './hud/radar';
import { LabelLayer, type LabelContext } from './hud/labels';
import { DemoStream, demoContexts, isDemoMode } from './demo';
import type { PodView, StreamEvent } from './types';
import { RecoveryTracker } from './recovery';
import { RecoveryPanel } from './recovery-panel';
import { LivePodOperations, ApiDeleteError, type PodOperations } from './operations';
import { DemoMission } from './demo-mission';
import type { CameraPreferences } from './camera';


const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new AquariumScene(canvas);
const detail = new DetailPanel();
const labels = new LabelLayer();
const topbar = document.querySelector('.topbar') as HTMLElement;
const searchPanel = document.getElementById('search') as HTMLElement;
const radarPanel = document.getElementById('radar') as HTMLElement;
const detailPanel = document.getElementById('detail') as HTMLElement;
const recoveryPanelElement = document.getElementById('recovery-panel') as HTMLElement;
const missionPanel = document.getElementById('demo-mission') as HTMLElement;
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
        showPod(uid);
      }
    }
  },
});

const radar = new RadarHUD({
  getItems: listRadarItems,
  getPose: () => scene.getRadarPose(),
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
let connected = false;
let synchronized = false;
let initialOverview = false;
let mission: DemoMission | undefined;
const inFlight = new Set<string>();
const tracker = new RecoveryTracker(() => performance.now());
const recoveryPanel = new RecoveryPanel(document.getElementById('recovery-panel')!, uid => showPod(uid), id => {
  tracker.dismiss(id); renderRecovery();
});
let previousRecovery = '';
function renderRecovery() {
  const operations = tracker.operations;
  const signature = JSON.stringify(operations.map(o => [o.id,o.phase,o.message,o.candidateUid]));
  if (signature === previousRecovery) return;
  previousRecovery = signature;
  recoveryPanel.render(operations);
  mission?.update(operations);
}
function showPod(uid: string, notifyMission = true) {
  const pod = store.pods.get(uid);
  if (!pod) return;
  detail.show(pod);
  scene.setFocused(uid);
  scene.focusOnPod(uid);
  if (notifyMission) mission?.selected(uid);
  syncInput();
}


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
    position: scene.getPodPosition(p.uid),
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
  showPod(item.id);
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
  const pod = store.pods.get(uid);
  if (!pod || !connected || !synchronized || inFlight.has(uid)) {
    scene.clearTargeted(uid); return;
  }
  if (tracker.operations.some(o => o.target.uid === uid && !['failed','ready','standalone'].includes(o.phase))) {
    scene.clearTargeted(uid); return;
  }
  inFlight.add(uid);
  const operation = tracker.begin(pod, store.pods.values());
  renderRecovery();
  try {
    await operations.deletePod(pod);
    tracker.accepted(operation.id);
  } catch (error) {
    tracker.failed(operation.id, error instanceof Error ? error.message : String(error), !(error instanceof ApiDeleteError));
    scene.clearTargeted(uid);
  } finally {
    inFlight.delete(uid);
    renderRecovery();
  }
}

const stream = new (isDemoMode ? DemoStream : Stream)((ev) => {
  pendingEvents.push(ev);
  scheduleFlush();
});
const operations: PodOperations = stream instanceof DemoStream ? stream : new LivePodOperations();
stream.onConnectionChange = (ok) => {
  tracker.connection(ok);
  if (!ok) synchronized = false;
  renderRecovery();
  document.getElementById('ws-dot')?.classList.toggle('live', ok);
  connected = ok;
  updateEmptyState();
};
document.getElementById('ws-dot')!.classList.remove('live');

scene.onSelect = (uid) => showPod(uid);
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
  syncInput();
};

const preferencesPanel = document.getElementById('camera-settings') as HTMLDetailsElement;
const settingsPanel = preferencesPanel.querySelector('.settings-panel') as HTMLElement;
function visibleRect(element: HTMLElement, visible: boolean): DOMRectReadOnly | undefined {
  if (!visible) return undefined;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : undefined;
}

function labelContext(): LabelContext {
  const blockedRects = [
    visibleRect(topbar, true),
    visibleRect(searchPanel, search.isOpen),
    visibleRect(radarPanel, radar.isOpen),
    visibleRect(detailPanel, detail.isOpen),
    visibleRect(settingsPanel, preferencesPanel.open),
    visibleRect(recoveryPanelElement, recoveryPanelElement.childElementCount > 0),
    visibleRect(missionPanel, missionPanel.childElementCount > 0),
  ].filter((rect): rect is DOMRectReadOnly => rect !== undefined);

  return {
    mode: scene.isDiving ? 'dive' : 'overview',
    filterActive: activeQuery.trim().length > 0,
    modalOpen: radar.isOpen,
    blockedRects,
  };
}

function syncInput() {
  scene.setInputBlocked(radar.isOpen || search.isOpen || detail.isOpen || preferencesPanel.open);
}
const observer = new MutationObserver(syncInput);
for (const id of ['radar','search','detail','camera-settings']) observer.observe(document.getElementById(id)!, {attributes:true,attributeFilter:['class','open']});
function overview() {
  radar.close(); search.close(); detail.hide(); preferencesPanel.open = false;
  scene.showOverview(); syncInput();
}
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (radar.isOpen) radar.close();
    else if (search.isOpen) search.close();
    else if (preferencesPanel.open) preferencesPanel.open = false;
    else if (detail.isOpen) detail.hide();
    else scene.exitDive();
    syncInput(); return;
  }
  if (isEditing(e.target) || e.repeat) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault(); setAttackMode(!attackMode);
  } else if (e.code === 'KeyO' && !e.metaKey && !e.ctrlKey) overview();
});
document.getElementById('overview-toggle')!.addEventListener('click', overview);
document.getElementById('dive-toggle')!.addEventListener('click', () => {
  radar.close(); search.close(); detail.hide(); preferencesPanel.open = false;
  scene.toggleDive(); syncInput();
});
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
let manualMotion = false;
let preferences: CameraPreferences = {lookSensitivity:1,invertY:false,reducedMotion:motionMedia.matches};
try {
  const saved = JSON.parse(localStorage.getItem('kubeaquarium.camera.v1') ?? 'null');
  if (saved && typeof saved.lookSensitivity === 'number' && typeof saved.invertY === 'boolean' && typeof saved.reducedMotion === 'boolean') {
    preferences = {...saved,lookSensitivity:Math.max(.25,Math.min(2,saved.lookSensitivity))}; manualMotion = true;
  }
} catch { /* Invalid stored settings use current defaults. */ }
const sensitivity = document.getElementById('look-sensitivity') as HTMLInputElement;
const invert = document.getElementById('invert-look') as HTMLInputElement;
const reduced = document.getElementById('reduce-motion') as HTMLInputElement;
function applyPreferences() {
  sensitivity.value = String(preferences.lookSensitivity); invert.checked=preferences.invertY; reduced.checked=preferences.reducedMotion;
  document.body.classList.toggle('reduced-motion',preferences.reducedMotion);
  scene.setPreferences(preferences);
}
for (const input of [sensitivity,invert,reduced]) input.addEventListener('input',()=>{
  preferences={lookSensitivity:Number(sensitivity.value),invertY:invert.checked,reducedMotion:reduced.checked};
  manualMotion=true; applyPreferences();
  try { localStorage.setItem('kubeaquarium.camera.v1',JSON.stringify(preferences)); } catch { /* Settings remain usable without storage. */ }
});
motionMedia.addEventListener('change',()=>{if (!manualMotion) {preferences.reducedMotion=motionMedia.matches;applyPreferences();}});
applyPreferences();
if (stream instanceof DemoStream) {
  const demo = stream;
  const root = document.getElementById('demo-mission')!;
  mission = new DemoMission(uid => scene.focusOnPod(uid), uid => showPod(uid), () => {
    for (const operation of tracker.operations) tracker.dismiss(operation.id);
    detail.hide(); setAttackMode(false); demo.resetMission(); initialOverview=false;
    previousRecovery=''; renderRecovery();
  }, () => {
    radar.close(); search.close(); detail.hide(); preferencesPanel.open=false;
    syncInput(); scene.prepareDiveOnPod('demo-mission-old'); setAttackMode(true);
  });
  mission.mount(root);
}

scene.start();
stream.start();

// Animation loop for label layer (runs in sync with rAF naturally via the scene clock).
let lastRadarRefresh = 0;
function labelLoop(timestamp: number) {
  if (scene.isDiving) moveReticle(window.innerWidth/2,window.innerHeight/2);
  if (timestamp-lastRadarRefresh>100) {radar.refresh();renderRecovery();lastRadarRefresh=timestamp;}
  const context = labelContext();
  labels.render(scene.getLabelTargets(), context);
  labels.renderNamespaces(scene.getNamespaceLabelTargets(), context);
  requestAnimationFrame(labelLoop);
}
requestAnimationFrame(labelLoop);

const contextsPromise = isDemoMode
  ? Promise.resolve(demoContexts())
  : fetch('/api/contexts').then(r => r.json());

contextsPromise.then((list: any[]) => {
  const cur = list.find(c => c.current);
  document.getElementById('ctx-name')!.textContent = cur ? cur.name : (list[0]?.name ?? '—');
}).catch(() => { document.getElementById('ctx-name')!.textContent = 'Context unavailable'; });

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
    tracker.observe(ev);
    if (ev.type === 'snapshot') {
      scene.reconcilePods(new Set(ev.pods.map(p => p.uid)));
      synchronized = true;
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
  if (!initialOverview && store.pods.size) {scene.showOverview();initialOverview=true;}
  renderRecovery();
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

function updateEmptyState() {
  const empty = document.getElementById('empty-state')!;
  const msg = document.getElementById('empty-msg')!;
  if (store.pods.size > 0) {
    empty.classList.add('hidden');
    // CSS opacity transitions can freeze under heavy WebGL load, leaving the
    // overlay half-visible; display:none is immune to transition throttling.
    empty.style.display = 'none';
    return;
  }
  empty.style.display = '';
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
  if (scene.isDiving) return;
  moveReticle(e.clientX, e.clientY);
});
window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !attackMode || !scene.isDiving || isInteractive(e.target)) return;
  if (!connected || !synchronized || radar.isOpen || search.isOpen || detail.isOpen || preferencesPanel.open) return;
  moveReticle(window.innerWidth/2, window.innerHeight/2);
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
  submarineDebug() { return scene.getSubmarineDebug(); },
  slotsDebug() { return scene.getSlotsDebug(); },
  navigationDebug() { return scene.getNavigationDebug(); },
  frameMetrics() { return scene.getFrameMetrics(); },
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
