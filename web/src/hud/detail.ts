import type { PodView } from '../types';

type Tab = 'overview' | 'events' | 'yaml' | 'logs';

interface PodEvent {
  lastSeen: string;
  type: string;
  reason: string;
  message: string;
  source: string;
  count: number;
}

/**
 * Owns the right-side detail panel: overview + events + yaml + log streaming.
 * Stateless across pods — selecting a new pod resets all tab state.
 */
export class DetailPanel {
  private root = document.getElementById('detail') as HTMLElement;
  private expandButton = this.root.querySelector('[data-expand]') as HTMLButtonElement;
  private currentUid?: string;
  private currentPod?: PodView;
  private activeTab: Tab = 'overview';
  private logsAbort?: AbortController;
  private logsBuf = '';
  private autoscroll = true;
  private expanded = false;
  private loaded: Record<Tab, boolean> = { overview: true, events: false, yaml: false, logs: false };

  constructor() {
    this.bindTabs();
    this.bindLogsControls();
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.hide());
    this.expandButton.addEventListener('click', () => this.setExpanded(!this.expanded));
    this.setExpanded(false);
  }

  show(p: PodView) {
    const newPod = this.currentUid !== p.uid;
    this.currentUid = p.uid;
    this.currentPod = p;
    this.root.classList.remove('hidden');

    if (newPod) {
      this.loaded = { overview: true, events: false, yaml: false, logs: false };
      this.stopLogs();
      this.logsBuf = '';
      this.setActiveTab('overview');
    }

    // Always refresh overview (pod data may have changed via stream)
    this.renderOverview(p);

    // Re-load any tab the user is currently on
    this.refreshActiveTab();
  }

  hide() {
    this.root.classList.add('hidden');
    this.stopLogs();
    this.currentUid = undefined;
    this.currentPod = undefined;
  }

  isOpenFor(uid: string) { return this.currentUid === uid; }

  private setExpanded(expanded: boolean) {
    this.expanded = expanded;
    this.root.classList.toggle('expanded', expanded);
    this.expandButton.textContent = expanded ? '↙' : '⛶';
    this.expandButton.title = expanded ? 'Collapse detail panel' : 'Expand detail panel';
    this.expandButton.setAttribute('aria-label', this.expandButton.title);
  }

  private bindTabs() {
    this.root.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as Tab;
        this.setActiveTab(tab);
        this.refreshActiveTab();
      });
    });
  }

  private setActiveTab(tab: Tab) {
    this.activeTab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('.tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    this.root.querySelectorAll<HTMLElement>('.tabpane').forEach(p =>
      p.classList.toggle('active', p.dataset.pane === tab));
  }

  private refreshActiveTab() {
    if (!this.currentPod) return;
    const p = this.currentPod;
    switch (this.activeTab) {
      case 'overview': /* always rendered fresh */ break;
      case 'events':
        this.loadEvents(p);
        break;
      case 'yaml':
        if (!this.loaded.yaml) this.loadYaml(p);
        break;
      case 'logs':
        if (!this.loaded.logs) this.initLogs(p);
        break;
    }
  }

  private renderOverview(p: PodView) {
    setText('d-name', p.name);
    setText('d-ns-pill', p.namespace);
    const phasePill = document.getElementById('d-phase-pill')!;
    phasePill.textContent = p.reason || p.phase;
    phasePill.className = 'pill ' + classifyPhase(p);
    setText('d-node', p.node || '—');
    setText('d-ready', p.ready ? 'yes' : 'no');
    setText('d-restarts', String(p.restartCount));
    setText('d-cpu', `${p.cpuMillis}m`);
    setText('d-mem', `${p.memMib} MiB`);
    setText('d-created', p.createdAt);
  }

  private async loadEvents(p: PodView) {
    const host = document.getElementById('d-events')!;
    host.innerHTML = `<div class="empty">loading…</div>`;
    try {
      const r = await fetch(`/api/pod/${p.namespace}/${p.name}/events`);
      const events: PodEvent[] = await r.json();
      this.loaded.events = true;
      if (!events.length) {
        host.innerHTML = `<div class="empty">no events</div>`;
        return;
      }
      host.innerHTML = events.map(e => `
        <div class="event ${e.type === 'Warning' ? 'warn' : ''}">
          <div class="event-head">
            <span class="reason">${escapeHtml(e.reason)}</span>
            <span class="when">${escapeHtml(e.lastSeen)} · ×${e.count}</span>
          </div>
          <div class="msg">${escapeHtml(e.message)}</div>
          <div class="src">${escapeHtml(e.source || '')}</div>
        </div>
      `).join('');
    } catch (err) {
      host.innerHTML = `<div class="empty">error: ${escapeHtml(String(err))}</div>`;
    }
  }

  private async loadYaml(p: PodView) {
    const host = document.getElementById('d-yaml')!;
    host.textContent = 'loading…';
    try {
      const r = await fetch(`/api/pod/${p.namespace}/${p.name}/yaml`);
      const text = await r.text();
      host.textContent = text;
      this.loaded.yaml = true;
    } catch (err) {
      host.textContent = `error: ${err}`;
    }
  }

  private async initLogs(p: PodView) {
    const sel = document.getElementById('d-container') as HTMLSelectElement;
    sel.innerHTML = '<option value="">loading…</option>';
    try {
      const r = await fetch(`/api/pod/${p.namespace}/${p.name}/containers`);
      const containers: string[] = await r.json();
      sel.innerHTML = containers.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      this.loaded.logs = true;
      this.startLogs(p, sel.value);
    } catch (err) {
      const term = document.getElementById('d-logs')!;
      term.textContent = `error: ${err}`;
    }
  }

  private bindLogsControls() {
    const sel = document.getElementById('d-container') as HTMLSelectElement;
    const follow = document.getElementById('d-follow') as HTMLInputElement;
    const clear = document.getElementById('d-clear') as HTMLButtonElement;
    sel.addEventListener('change', () => {
      if (this.currentPod) this.startLogs(this.currentPod, sel.value);
    });
    follow.addEventListener('change', () => {
      if (this.currentPod) this.startLogs(this.currentPod, sel.value);
    });
    clear.addEventListener('click', () => {
      this.logsBuf = '';
      const term = document.getElementById('d-logs')!;
      term.textContent = '';
    });

    const term = document.getElementById('d-logs')!;
    term.addEventListener('scroll', () => {
      const atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 4;
      this.autoscroll = atBottom;
    });
  }

  private stopLogs() {
    this.logsAbort?.abort();
    this.logsAbort = undefined;
  }

  private async startLogs(p: PodView, container: string) {
    this.stopLogs();
    const follow = (document.getElementById('d-follow') as HTMLInputElement).checked;
    const term = document.getElementById('d-logs')!;
    term.textContent = '';
    this.logsBuf = '';

    const ctrl = new AbortController();
    this.logsAbort = ctrl;
    const url = `/api/pod/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}/logs?container=${encodeURIComponent(container)}&tail=200&follow=${follow ? 1 : 0}`;
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.body) {
        term.textContent = '(no body)';
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        this.appendLogChunk(chunk);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.appendLogChunk(`\n[stream error: ${err}]`);
      }
    }
  }

  private appendLogChunk(chunk: string) {
    const term = document.getElementById('d-logs')!;
    this.logsBuf += chunk;
    // Cap buffer at ~256KB
    if (this.logsBuf.length > 256 * 1024) {
      this.logsBuf = this.logsBuf.slice(this.logsBuf.length - 200 * 1024);
      term.textContent = this.logsBuf;
    } else {
      term.append(chunk);
    }
    if (this.autoscroll) term.scrollTop = term.scrollHeight;
  }
}

function setText(id: string, v: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function classifyPhase(p: PodView): string {
  const r = p.reason;
  if (r === 'CrashLoopBackOff' || r === 'Error' || r === 'ImagePullBackOff' || r === 'ErrImagePull') return 'err';
  if (p.phase === 'Running' && p.ready) return 'ok';
  if (p.phase === 'Pending') return 'warn';
  if (p.phase === 'Failed') return 'err';
  if (p.phase === 'Succeeded') return 'ok';
  return '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
