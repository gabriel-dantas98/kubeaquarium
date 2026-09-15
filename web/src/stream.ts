import type { StreamEvent, PodView } from './types';

export type Handler = (e: StreamEvent) => void;

export class Stream {
  private ws?: WebSocket;
  private url: string;
  private handler: Handler;
  private reconnectTimer?: number;
  private generation = 0;
  private stopped = true;
  onConnectionChange?: (connected: boolean) => void;

  constructor(handler: Handler) {
    this.handler = handler;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${proto}://${location.host}/api/stream`;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  private connect() {
    const generation = ++this.generation;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { if (this.valid(generation)) this.onConnectionChange?.(true); };
    ws.onclose = () => {
      if (!this.valid(generation)) return;
      this.onConnectionChange?.(false);
      this.reconnectTimer = window.setTimeout(() => { if (this.valid(generation)) this.connect(); }, 1500);
    };
    ws.onerror = () => { if (this.valid(generation)) ws.close(); };
    ws.onmessage = (m) => {
      if (!this.valid(generation)) return;
      try {
        const ev = JSON.parse(m.data) as StreamEvent;
        if (ev && (ev.type === 'snapshot' ? Array.isArray(ev.pods) : ev.type === 'deleted' ? typeof ev.uid === 'string' : (ev.type === 'added' || ev.type === 'updated') && !!ev.pod)) this.handler(ev);
      } catch {}
    };
  }

  private valid(generation: number) { return !this.stopped && generation === this.generation; }

  stop() {
    this.stopped = true;
    ++this.generation;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.ws?.close();
    this.ws = undefined;
    this.onConnectionChange?.(false);
  }
}

export class PodStore {
  pods = new Map<string, PodView>();
  onChange?: () => void;
  apply(ev: StreamEvent) {
    switch (ev.type) {
      case 'snapshot':
        this.pods.clear();
        for (const p of ev.pods) this.pods.set(p.uid, p);
        break;
      case 'added':
      case 'updated':
        this.pods.set(ev.pod.uid, ev.pod);
        break;
      case 'deleted':
        this.pods.delete(ev.uid);
        break;
    }
    this.onChange?.();
  }
}
