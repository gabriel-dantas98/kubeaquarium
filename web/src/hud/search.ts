import type { PodView } from '../types';

/**
 * k9s-style filter syntax.
 *
 * Examples:
 *   nginx                 → name contains "nginx" (case insensitive)
 *   ns:web                → namespace is "web"
 *   ns:web,payments       → namespace is "web" OR "payments"
 *   phase:Running         → phase is Running
 *   phase:!Running        → phase is NOT Running
 *   node:control-plane    → node name contains "control-plane"
 *   /^nginx-/             → name matches regex
 *   nginx ns:web          → AND of all terms
 */
export type Filter = (p: PodView) => boolean;
export const ALL: Filter = () => true;

interface Term {
  test: (p: PodView) => boolean;
}

function compileTerm(raw: string): Term | null {
  const t = raw.trim();
  if (!t) return null;

  // Regex
  if (t.startsWith('/') && t.endsWith('/') && t.length > 1) {
    try {
      const re = new RegExp(t.slice(1, -1), 'i');
      return { test: p => re.test(p.name) };
    } catch { return null; }
  }

  // key:value(,value...) where leading ! negates
  const colon = t.indexOf(':');
  if (colon > 0) {
    const key = t.slice(0, colon).toLowerCase();
    let raw = t.slice(colon + 1);
    let neg = false;
    if (raw.startsWith('!')) { neg = true; raw = raw.slice(1); }
    const values = raw.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
    if (values.length === 0) return null;
    const test = (p: PodView): boolean => {
      let field: string;
      switch (key) {
        case 'ns': case 'namespace': field = p.namespace; break;
        case 'phase': case 'status': field = p.reason || p.phase; break;
        case 'node': field = p.node; break;
        case 'name': field = p.name; break;
        case 'reason': field = p.reason; break;
        default: return true; // unknown key → ignore (don't filter out)
      }
      const f = (field || '').toLowerCase();
      const hit = values.some(v => f === v || f.includes(v));
      return neg ? !hit : hit;
    };
    return { test };
  }

  // Plain text → name substring (case insensitive)
  const needle = t.toLowerCase();
  return { test: p => p.name.toLowerCase().includes(needle) };
}

export function compile(query: string): Filter {
  const terms: Term[] = [];
  // Split on whitespace, but keep quoted segments intact
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/^"|"$/g, '');
    const term = compileTerm(cleaned);
    if (term) terms.push(term);
  }
  if (terms.length === 0) return ALL;
  return (p) => {
    for (const t of terms) if (!t.test(p)) return false;
    return true;
  };
}

// ---------- Search overlay UI ----------

export interface SearchHandlers {
  onChange: (filter: Filter, raw: string) => void;
  onSubmit: (raw: string) => void; // Enter
}

export class SearchHUD {
  private root = document.getElementById('search') as HTMLDivElement;
  private input = document.getElementById('search-input') as HTMLInputElement;
  private count = document.getElementById('search-count') as HTMLSpanElement;
  private isOpen = false;

  constructor(private handlers: SearchHandlers) {
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('input', () => {
      const raw = this.input.value;
      this.handlers.onChange(compile(raw), raw);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.handlers.onSubmit(this.input.value);
      }
    });
  }

  open() {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.input.focus();
    this.input.select();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.input.blur();
    this.input.value = '';
    this.handlers.onChange(ALL, '');
  }

  private onKey(e: KeyboardEvent) {
    // Don't intercept while another input/textarea is active.
    const tgt = e.target as HTMLElement;
    const editing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);

    if (!this.isOpen && e.key === '/' && !editing) {
      e.preventDefault();
      this.open();
    }
  }

  setCount(matched: number, total: number, hasFilter: boolean) {
    if (!hasFilter) { this.count.textContent = ''; return; }
    this.count.textContent = `${matched} / ${total}`;
  }
}
