import type { PodView, StreamEvent } from './types';

export type RecoveryPhase = 'requesting' | 'accepted' | 'absent' | 'candidate' | 'ready' | 'failed' | 'unknown' | 'ambiguous' | 'standalone';
export interface RecoveryOperation {
  id: string; target: PodView; phase: RecoveryPhase; startedAt: number;
  acceptedAt?: number; absentAt?: number; candidateUid?: string; candidate?: PodView; readyObservedAt?: number;
  baselineUids: Set<string>; candidateUids: Set<string>; observationIncomplete: boolean; message: string;
}
type State = { operation: RecoveryOperation; absent: boolean; candidates: Map<string, PodView>; seenAdded: Set<string>; gap: boolean; ambiguous: boolean; restartObserved: boolean };
const closed = new Set<RecoveryPhase>(['ready', 'failed', 'unknown', 'ambiguous', 'standalone']);
const controllerKinds = new Set(['ReplicaSet', 'ReplicationController', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']);
function sameController(a: PodView, b: PodView) { return !!a.controller && !!b.controller && a.namespace === b.namespace && a.controller.uid === b.controller.uid; }
function later(target: PodView, pod: PodView) {
  const targetTime = Date.parse(target.createdAt), candidateTime = Date.parse(pod.createdAt);
  return !Number.isFinite(targetTime) || !Number.isFinite(candidateTime) || candidateTime >= targetTime;
}
function eligible(target: PodView, pod: PodView) {
  if (!sameController(target, pod) || target.uid === pod.uid || !!pod.deletionTimestamp || !later(target, pod)) return false;
  switch (target.controller!.kind) {
    case 'StatefulSet': return target.name === pod.name;
    case 'DaemonSet': return !!target.node && target.node === pod.node;
    case 'ReplicaSet': case 'ReplicationController': case 'Job': case 'CronJob': return true;
    default: return false;
  }
}

export class RecoveryTracker {
  private states: State[] = [];
  private disconnected = false;
  constructor(private now: () => number) {}
  get operations(): readonly RecoveryOperation[] { this.refreshWaiting(); return this.states.map(s => s.operation); }
  begin(target: PodView, pods: Iterable<PodView>): RecoveryOperation {
    const existing = this.states.find(s => s.operation.target.uid === target.uid && !closed.has(s.operation.phase));
    if (existing) return existing.operation;
    const baselineUids = new Set([...pods].filter(p => sameController(target, p)).map(p => p.uid));
    const operation: RecoveryOperation = { id: crypto.randomUUID(), target, phase: 'requesting', startedAt: this.now(), baselineUids, candidateUids: new Set(), observationIncomplete: this.disconnected, message: 'Sending delete request' };
    this.states.push({ operation, absent: false, candidates: new Map(), seenAdded: new Set(), gap: this.disconnected, ambiguous: false, restartObserved: false });
    this.recompute(); this.prune(); return operation;
  }
  accepted(id: string): void {
    const state = this.find(id);
    if (!state || ['failed', 'unknown', 'ambiguous', 'standalone'].includes(state.operation.phase)) return;
    state.operation.acceptedAt = this.now(); this.recompute();
  }
  failed(id: string, message: string, uncertain: boolean): void {
    const state = this.find(id); if (!state) return;
    state.operation.phase = uncertain ? 'unknown' : 'failed';
    state.operation.message = uncertain ? 'Request outcome unknown: ' + message : 'Delete failed: ' + message;
    this.prune();
  }
  connection(connected: boolean): void {
    this.disconnected = !connected;
    if (!connected) for (const state of this.states) if (!closed.has(state.operation.phase)) {
      state.gap = true; state.operation.observationIncomplete = true;
    }
  }
  observe(event: StreamEvent): void {
    if (event.type === 'snapshot') {
      for (const state of this.states) {
        state.candidates.clear();
        if (event.pods.some(p => p.uid === state.operation.target.uid)) {
          state.absent = false;
          state.operation.absentAt = undefined;
          state.operation.readyObservedAt = undefined;
        } else state.absent = true;
        for (const pod of event.pods) this.consider(state, pod, false);
      }
    } else if (event.type === 'deleted') {
      for (const state of this.states) {
        state.candidates.delete(event.uid);
        if (state.operation.target.uid === event.uid) { state.absent = true; if (!state.gap) state.operation.absentAt ??= this.now(); }
      }
    } else for (const state of this.states) {
      if (event.type === 'updated' && state.operation.target.uid === event.pod.uid && event.pod.restartCount > state.operation.target.restartCount) state.restartObserved = true;
      this.consider(state, event.pod, event.type === 'added');
    }
    this.recompute(); this.prune();
  }
  dismiss(id: string): void { this.states = this.states.filter(s => s.operation.id !== id); }
  private find(id: string) { return this.states.find(s => s.operation.id === id); }
  private consider(state: State, pod: PodView, added: boolean): void {
    const operation = state.operation;
    if (!eligible(operation.target, pod) || operation.baselineUids.has(pod.uid)) { state.candidates.delete(pod.uid); return; }
    if (added) state.seenAdded.add(pod.uid);
    if (state.gap && !state.seenAdded.has(pod.uid)) operation.observationIncomplete = true;
    state.candidates.set(pod.uid, pod);
    operation.candidateUids.add(pod.uid);
  }
  private recompute(): void {
    for (const state of this.states) {
      const operation = state.operation;
      if (operation.phase === 'failed' || operation.phase === 'unknown' || operation.phase === 'standalone') continue;
      if (!operation.target.controller) { operation.phase = 'standalone'; operation.message = 'Standalone pod: no controller-managed replacement expected'; continue; }
      const kind = operation.target.controller.kind;
      if (!controllerKinds.has(kind)) { operation.phase = 'unknown'; operation.message = 'Controller activity observed; replacement is not identified for this kind'; continue; }
      if (state.ambiguous || this.states.some(other => other !== state && this.overlaps(state, other)) || operation.candidateUids.size > 1) {
        state.ambiguous = true; operation.phase = 'ambiguous'; operation.readyObservedAt = undefined; operation.message = 'Multiple targets or candidate pods; replacement is ambiguous'; continue;
      }
      const candidate = [...state.candidates.values()][0];
      operation.candidateUid = candidate?.uid;
      operation.candidate = candidate;
      if (!candidate || !state.absent || !candidate.ready || !!candidate.deletionTimestamp || kind === 'Job' || kind === 'CronJob') operation.readyObservedAt = undefined;
      if (candidate && state.absent && candidate.ready && !candidate.deletionTimestamp && kind !== 'Job' && kind !== 'CronJob') {
        operation.phase = 'ready';
        if (!operation.observationIncomplete && state.seenAdded.has(candidate.uid) && operation.absentAt !== undefined) {
          operation.readyObservedAt ??= this.now();
          operation.message = 'New pod observed for the same controller; Ready observed after ' + ((operation.readyObservedAt - operation.startedAt) / 1000).toFixed(1) + 's from request';
        } else { operation.readyObservedAt = undefined; operation.message = 'Ready in latest snapshot; exact recovery timing unavailable'; }
      } else if (candidate && state.absent) {
        operation.phase = 'candidate';
        operation.message = kind === 'Job' || kind === 'CronJob' ? 'New pod observed for the same controller; completion is not guaranteed' : 'New pod observed: ' + candidate.namespace + '/' + candidate.name + '; waiting for Ready';
      } else if (state.absent) {
        operation.phase = 'absent'; operation.message = operation.absentAt === undefined ? 'Pod absent in latest snapshot' : 'Pod deletion observed; waiting for a new pod';
      } else if (operation.acceptedAt !== undefined) { operation.phase = 'accepted'; operation.message = state.restartObserved ? 'Restart observed; target UID is unchanged' : 'Delete accepted; waiting for observation'; }
      else { operation.phase = 'requesting'; operation.message = 'Sending delete request'; }
    }
  }
  private overlaps(state: State, other: State) {
    const target = state.operation.target, otherTarget = other.operation.target;
    if (!sameController(target, otherTarget) || ['failed', 'unknown', 'standalone'].includes(other.operation.phase)) return false;
    if (target.controller!.kind === 'StatefulSet') return target.name === otherTarget.name;
    if (target.controller!.kind === 'DaemonSet') return target.node === otherTarget.node;
    return true;
  }
  private refreshWaiting(): void {
    for (const state of this.states) if (!closed.has(state.operation.phase) && this.now() - state.operation.startedAt >= 60_000) state.operation.message = 'Still waiting; recovery is not confirmed';
  }
  private prune(): void {
    const ended = this.states.filter(s => closed.has(s.operation.phase)); if (ended.length <= 20) return;
    const drop = new Set(ended.slice(0, ended.length - 20)); this.states = this.states.filter(s => !drop.has(s));
  }
}
