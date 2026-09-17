import { RecoveryPanel } from './recovery-panel';
import type { RecoveryOperation, RecoveryPhase } from './recovery';
import type { PodView } from './types';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function operation(phase: RecoveryPhase, message: string, candidateUid?: string): RecoveryOperation {
  const target: PodView = {
    uid: 'old', name: 'checkout-old', namespace: 'payments', node: 'node-1',
    phase: 'Running', ready: false, restartCount: 0, reason: '', cpuMillis: 10,
    memMib: 16, createdAt: '2026-09-10T12:00:00.000Z', deletionTimestamp: '', controller: null,
  };
  return {
    id: `${phase}-${message}`, target, phase, startedAt: 0, message, candidateUid,
    baselineUids: new Set(), candidateUids: new Set(), observationIncomplete: false,
  };
}

export function runRecoveryPanelTests(): void {
  const root = document.createElement('section');
  const focused: string[] = [];
  const dismissed: string[] = [];
  const panel = new RecoveryPanel(root, uid => focused.push(uid), id => dismissed.push(id), uid => uid === 'present');

  assert(root.getAttribute('role') === 'status' && root.getAttribute('aria-live') === 'polite', 'recovery updates are announced politely');
  const phases: Array<[RecoveryPhase, string]> = [
    ['accepted', 'Delete accepted; waiting for observation'],
    ['failed', 'Delete failed: server rejected the request'],
    ['unknown', 'Request outcome unknown: the request may have reached the server'],
    ['standalone', 'Standalone pod: no controller-managed replacement expected'],
    ['candidate', 'New pod observed: payments/checkout-new; waiting for Ready'],
    ['ready', 'New pod observed for the same controller; Ready observed after 1.2s from request'],
    ['ready', 'Ready in latest snapshot; exact recovery timing unavailable'],
  ];
  for (const [phase, message] of phases) {
    panel.render([operation(phase, message)]);
    assert(root.textContent?.includes(message), `${phase} text is visible`);
  }

  const unsafe = '<img src=x onerror=window.__unsafe=true>';
  panel.render([operation('failed', unsafe)]);
  assert(root.textContent?.includes(unsafe), 'server text is rendered literally');
  assert(root.querySelector('img') === null, 'server text never becomes markup');
  (root.querySelector('button') as HTMLButtonElement).click();
  assert(dismissed.length === 1, 'failed operation can be dismissed');

  panel.render([operation('candidate', 'candidate', 'missing')]);
  const missingFocus = root.querySelector('button') as HTMLButtonElement;
  assert(missingFocus.disabled, 'missing candidate cannot be focused');
  missingFocus.click();
  assert(focused.length === 0, 'disabled focus button does not invoke its action');

  panel.render([operation('candidate', 'candidate', 'present')]);
  const presentFocus = root.querySelector('button') as HTMLButtonElement;
  presentFocus.click();
  assert(focused.join() === 'present', 'present candidate can be focused');

  const many = Array.from({ length: 6 }, (_, index) => operation('accepted', `operation ${index}`));
  panel.render(many);
  assert(root.querySelectorAll('article').length === 5, 'only five operations are initially visible');
  const expand = [...root.querySelectorAll('button')].find(button => button.textContent === 'Show 1 more') as HTMLButtonElement;
  expand.click();
  assert(root.querySelectorAll('article').length === 6, 'expander reveals older operations');
}
