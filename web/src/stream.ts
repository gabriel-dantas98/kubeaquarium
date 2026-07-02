import type { StreamEvent, PodView } from './types';

export type Handler = (e: StreamEvent) => void;

export class Stream {
  private ws?: WebSocket;
  private url: string;
  private handler: Handler;
  private reconnectTimer?: number;
  onConnectionChange?: (connected: boolean) => void;

  constructor(handler: Handler) {
    this.handler = handler;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${proto}://${location.host}/api/stream`;
  }

  start() { this.connect(); }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.onConnectionChange?.(true);
    ws.onclose = () => {
      this.onConnectionChange?.(false);
      this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as StreamEvent;
        this.handler(ev);
      } catch {}
    };
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
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
