import type { PodView, StreamEvent } from './types';

export type RecoveryPhase = 'requesting' | 'accepted' | 'absent' | 'candidate' | 'ready' | 'failed' | 'unknown' | 'ambiguous' | 'standalone';
export interface RecoveryOperation {
  id: string; target: PodView; phase: RecoveryPhase; startedAt: number;
  acceptedAt?: number; absentAt?: number; candidateUid?: string; readyObservedAt?: number;
  baselineUids: Set<string>; candidateUids: Set<string>; observationIncomplete: boolean; message: string;
}
type State = { operation: RecoveryOperation; absent: boolean; candidates: Map<string, PodView>; seenAdded: Set<string>; gap: boolean; waiting: boolean };
const terminal = new Set<RecoveryPhase>(['ready', 'failed', 'unknown', 'ambiguous', 'standalone']);
function sameOwner(a: PodView, b: PodView) {
  return !!a.controller && !!b.controller && a.namespace === b.namespace && a.controller.uid === b.controller.uid && a.controller.kind === b.controller.kind;
}
function eligible(target: PodView, pod: PodView) {
  if (!sameOwner(target, pod) || target.uid === pod.uid || pod.deletionTimestamp) return false;
  const kind = target.controller!.kind;
  if (kind === 'StatefulSet') return target.name === pod.name;
  if (kind === 'DaemonSet') return !!target.node && target.node === pod.node;
  return kind === 'ReplicaSet' || kind === 'ReplicationController' || kind === 'Job' || kind === 'CronJob';
}
function later(target: PodView, pod: PodView) {
  const a = Date.parse(target.createdAt), b = Date.parse(pod.createdAt);
  return !Number.isFinite(a) || !Number.isFinite(b) || b >= a;
}
export class RecoveryTracker {
  private states: State[] = [];
  private pods = new Map<string, PodView>();
  private disconnected = false;
  constructor(private now: () => number) {}
  get operations(): readonly RecoveryOperation[] { this.refreshWaiting(); return this.states.map(s => s.operation); }
  begin(target: PodView, pods: Iterable<PodView>): RecoveryOperation {
    const prior = this.states.find(s => s.operation.target.uid === target.uid && !terminal.has(s.operation.phase));
    if (prior) return prior.operation;
    this.pods = new Map([...pods].map(p => [p.uid, p]));
    const baselineUids = new Set([...this.pods.values()].filter(p => sameOwner(target, p)).map(p => p.uid));
    const operation: RecoveryOperation = { id: crypto.randomUUID(), target, phase: 'requesting', startedAt: this.now(), baselineUids, candidateUids: new Set(), observationIncomplete: this.disconnected, message: 'Sending delete request' };
    const state: State = { operation, absent: false, candidates: new Map(), seenAdded: new Set(), gap: this.disconnected, waiting: false };
    this.states.push(state);
    this.recompute();
    this.prune();
    return operation;
  }
  accepted(id: string) {
    const s = this.states.find(s => s.operation.id === id); if (!s) return;
    s.operation.acceptedAt = this.now();
    if (s.operation.phase === 'requesting') s.operation.phase = 'accepted';
    this.recompute();
  }
  failed(id: string, message: string, uncertain: boolean) {
    const s = this.states.find(s => s.operation.id === id); if (!s) return;
    s.operation.phase = uncertain ? 'unknown' : 'failed';
    s.operation.message = uncertain ? `Request outcome unknown: ${message}` : `Delete failed: ${message}`;
    this.prune();
  }
  connection(connected: boolean) {
    if (!connected) {
      this.disconnected = true;
      for (const s of this.states) if (!terminal.has(s.operation.phase)) { s.gap = true; s.operation.observationIncomplete = true; }
    } else this.disconnected = false;
  }
  observe(event: StreamEvent) {
    if (event.type === 'snapshot') {
      this.pods = new Map(event.pods.map(p => [p.uid, p]));
      for (const s of this.states) {
        const o = s.operation;
        if (!this.pods.has(o.target.uid)) s.absent = true;
        for (const p of event.pods) this.consider(s, p, false);
        if (s.gap) o.observationIncomplete = true;
      }
    } else if (event.type === 'deleted') {
      this.pods.delete(event.uid);
      for (const s of this.states) if (s.operation.target.uid === event.uid) {
        s.absent = true;
        if (!s.gap) s.operation.absentAt = this.now();
      }
    } else {
      this.pods.set(event.pod.uid, event.pod);
      for (const s of this.states) this.consider(s, event.pod, event.type === 'added');
    }
    this.recompute();
  }
  dismiss(id: string) { this.states = this.states.filter(s => s.operation.id !== id); }
  private consider(s: State, pod: PodView, added: boolean) {
    const o = s.operation;
    if (!eligible(o.target, pod) || o.baselineUids.has(pod.uid) || !later(o.target, pod)) return;
    if (s.gap && !s.seenAdded.has(pod.uid)) {
      // A snapshot after a gap can establish current state, but never creation time.
      o.observationIncomplete = true;
    }
    if (added && !s.gap) s.seenAdded.add(pod.uid);
    s.candidates.set(pod.uid, pod);
    o.candidateUids.add(pod.uid);
  }
  private recompute() {
    for (const s of this.states) {
      const o = s.operation;
      if (o.phase === 'failed' || o.phase === 'unknown') continue;
      if (!o.target.controller) { o.phase = 'standalone'; o.message = 'Standalone pod: no controller-managed replacement expected'; continue; }
      const kind = o.target.controller.kind;
      if (!['ReplicaSet', 'ReplicationController', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(kind)) {
        o.phase = 'unknown'; o.message = 'Controller activity observed; replacement is not identified for this kind'; continue;
      }
      const peers = this.states.filter(x => x !== s && sameOwner(x.operation.target, o.target) && x.operation.phase !== 'failed' && x.operation.phase !== 'unknown' && x.operation.phase !== 'standalone');
      const shared = peers.some(x => kind !== 'StatefulSet' && kind !== 'DaemonSet' || kind === 'StatefulSet' && x.operation.target.name === o.target.name || kind === 'DaemonSet' && x.operation.target.node === o.target.node);
      if (shared || s.candidates.size > 1) { o.phase = 'ambiguous'; o.message = 'Multiple targets or candidate pods; replacement is ambiguous'; continue; }
      const candidate = [...s.candidates.values()][0];
      o.candidateUid = candidate?.uid;
      if (candidate && s.absent && candidate.ready && !candidate.deletionTimestamp && kind !== 'Job' && kind !== 'CronJob') {
        o.phase = 'ready';
        if (!o.observationIncomplete && s.seenAdded.has(candidate.uid) && o.absentAt !== undefined) {
          o.readyObservedAt ??= this.now();
          o.message = `New pod observed for the same controller; Ready observed after ${((o.readyObservedAt - o.startedAt) / 1000).toFixed(1)}s from request`;
        } else { o.readyObservedAt = undefined; o.message = 'Ready in latest snapshot; exact recovery timing unavailable'; }
      } else if (candidate && s.absent) { o.phase = 'candidate'; o.message = kind === 'Job' || kind === 'CronJob' ? 'New pod observed for the same controller; completion is not guaranteed' : `New pod observed: ${candidate.namespace}/${candidate.name}; waiting for Ready`; }
      else if (s.absent) { o.phase = 'absent'; o.message = o.absentAt === undefined ? 'Pod absent in latest snapshot' : 'Pod deletion observed; waiting for a new pod'; }
      else if (o.acceptedAt !== undefined) { o.phase = 'accepted'; o.message = 'Delete accepted; waiting for observation'; }
      else { o.phase = 'requesting'; o.message = 'Sending delete request'; }
    }
  }
  private refreshWaiting() { for (const s of this.states) if (!terminal.has(s.operation.phase) && this.now() - s.operation.startedAt >= 60000) { s.waiting = true; s.operation.message = 'Still waiting; recovery is not confirmed'; } }
  private prune() { const ended = this.states.filter(s => terminal.has(s.operation.phase)); if (ended.length > 20) { const drop = new Set(ended.slice(0, ended.length - 20)); this.states = this.states.filter(s => !drop.has(s)); } }
}
