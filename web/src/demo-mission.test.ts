import { DemoMission } from './demo-mission';
import type { RecoveryOperation, RecoveryPhase } from './recovery';
import type { PodView } from './types';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function operation(phase: RecoveryPhase, acceptedAt?: number): RecoveryOperation {
  const target: PodView = {
    uid: 'demo-mission-old', name: 'checkout-demo-old', namespace: 'bench-payments', node: 'demo-node-1',
    phase: 'Running', ready: false, restartCount: 5, reason: 'CrashLoopBackOff', cpuMillis: 80,
    memMib: 128, createdAt: '2026-09-10T12:00:00.000Z', deletionTimestamp: '',
    controller: { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'checkout-demo', uid: 'demo-rs-checkout' },
  };
  return { id: phase, target, phase, startedAt: 0, acceptedAt, message: phase, baselineUids: new Set(), candidateUids: new Set(), observationIncomplete: false };
}

export function runDemoMissionTests(): void {
  const root = document.createElement('section');
  const focused: string[] = [];
  const inspected: string[] = [];
  let restarted = 0;
  let prepared = 0;
  const mission = new DemoMission(
    uid => focused.push(uid),
    uid => { inspected.push(uid); mission.selected(uid); },
    () => { restarted++; },
    () => { prepared++; },
  );
  mission.mount(root);
  assert(root.textContent?.includes('SIMULATED · No cluster changes') && mission.state === 'find', 'mission starts with its persistent simulated badge');
  mission.selected('unrelated');
  mission.update([operation('ready')]);
  assert(mission.state === 'find', 'wrong selection and unrelated Ready evidence do not advance the mission');

  button(root, 'Find pod').click();
  assert(focused.join() === 'demo-mission-old' && String(mission.state) === 'inspect', 'find control focuses the target');
  button(root, 'Inspect failure').click();
  assert(inspected.join() === 'demo-mission-old' && String(mission.state) === 'fire', 'inspection records a real target selection');
  mission.update([operation('absent')]);
  mission.update([operation('candidate')]);
  mission.update([operation('ready')]);
  assert(String(mission.state) === 'fire', 'stream observations before HTTP acceptance cannot advance the mission');
  button(root, 'Prepare submarine').click();
  assert(prepared === 1 && String(mission.state) === 'fire', 'prepare control only arms the visible attack flow');
  mission.update([operation('ready', 10)]);
  assert(String(mission.state) === 'complete', 'late HTTP acceptance completes a tracker operation already observed Ready');

  button(root, 'Restart mission').click();
  assert(restarted === 1 && String(mission.state) === 'find', 'restart resets the guide for a second run');
  button(root, 'Find pod').click();
  button(root, 'Inspect failure').click();
  mission.update([operation('accepted', 11)]);
  assert(String(mission.state) === 'observe', 'accepted delete evidence advances to observation');
  mission.update([operation('candidate', 11)]);
  assert(String(mission.state) === 'observe', 'ordinary candidate updates do not skip the observation step');
  mission.update([operation('ready', 11)]);
  assert(String(mission.state) === 'complete', 'tracker Ready evidence completes the second mission cycle');
  button(root, 'Explore freely').click();
  assert(root.childElementCount === 0, 'explore freely dismisses the guide without an operation');
  mission.dispose();
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(element => element.textContent === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${label} control`);
  return found;
}
