export type RadarKind = 'pod';

export interface RadarItem {
  id: string;
  kind: RadarKind;
  name: string;
  namespace?: string;
  status?: string;
  meta?: string;
  tokens: string[];
}

export interface RadarHandlers {
  getItems: () => RadarItem[];
  onSelect: (item: RadarItem) => void;
}

interface RankedItem {
  item: RadarItem;
  score: number;
}

const MAX_RESULTS = 50;

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function splitQuery(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function scoreItem(item: RadarItem, terms: string[]): number | null {
  if (terms.length === 0) return 1;

  let score = 0;
  const name = normalize(item.name);
  const namespace = normalize(item.namespace ?? '');
  const kind = normalize(item.kind);

  for (const term of terms) {
    let termScore = 0;
    for (const token of item.tokens) {
      if (token === term) termScore = Math.max(termScore, 100);
      else if (token.startsWith(term)) termScore = Math.max(termScore, 50);
      else if (token.includes(term)) termScore = Math.max(termScore, 20);
    }
    if (termScore === 0) return null;
    score += termScore;
  }

  for (const term of terms) {
    if (name === term) score += 80;
    else if (name.startsWith(term)) score += 35;
    if (namespace === term) score += 24;
    if (kind === term) score += 12;
  }

  return score;
}

function rankItems(items: RadarItem[], query: string): RadarItem[] {
  const terms = splitQuery(query);
  const ranked: RankedItem[] = [];
  for (const item of items) {
    const score = scoreItem(item, terms);
    if (score === null) continue;
    ranked.push({ item, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ns = (a.item.namespace ?? '').localeCompare(b.item.namespace ?? '');
    if (ns !== 0) return ns;
    return a.item.name.localeCompare(b.item.name);
  });
  return ranked.slice(0, MAX_RESULTS).map(r => r.item);
}

function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]!);
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RadarHUD {
  private root = document.getElementById('radar') as HTMLDivElement;
  private input = document.getElementById('radar-input') as HTMLInputElement;
  private results = document.getElementById('radar-results') as HTMLDivElement;
  private count = document.getElementById('radar-count') as HTMLSpanElement;
  private scope = document.getElementById('radar-scope') as HTMLDivElement;
  private empty = document.getElementById('radar-empty') as HTMLDivElement;
  private isOpen = false;
  private query = '';
  private activeIndex = 0;
  private visibleItems: RadarItem[] = [];

  constructor(private handlers: RadarHandlers) {
    window.addEventListener('keydown', e => this.onGlobalKey(e));
    this.input.addEventListener('input', () => {
      this.query = this.input.value;
      this.activeIndex = 0;
      this.render();
    });
    this.input.addEventListener('keydown', e => this.onInputKey(e));
  }

  open() {
    this.isOpen = true;
    this.query = '';
    this.activeIndex = 0;
    this.input.value = '';
    this.root.classList.remove('hidden');
    this.render();
    this.input.focus();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.input.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private render() {
    const items = this.handlers.getItems();
    this.visibleItems = rankItems(items, this.query);
    if (this.activeIndex >= this.visibleItems.length) {
      this.activeIndex = Math.max(0, this.visibleItems.length - 1);
    }
    this.count.textContent = `${this.visibleItems.length} / ${items.length}`;
    this.renderResults();
    this.renderScope();
  }

  private renderResults() {
    const hasItems = this.visibleItems.length > 0;
    this.empty.classList.toggle('hidden', hasItems);
    if (!hasItems) {
      this.results.innerHTML = '';
      return;
    }

    this.results.innerHTML = this.visibleItems.map((item, index) => {
      const active = index === this.activeIndex ? ' active' : '';
      const status = item.status ? `<span class="radar-status">${escapeHtml(item.status)}</span>` : '';
      const meta = item.meta ? `<span>${escapeHtml(item.meta)}</span>` : '';
      const namespace = item.namespace ? `<span>${escapeHtml(item.namespace)}</span>` : '';
      return `
        <button class="radar-row${active}" type="button" role="option" aria-selected="${index === this.activeIndex}" data-index="${index}">
          <span class="radar-kind">${escapeHtml(item.kind)}</span>
          <span class="radar-name">${escapeHtml(item.name)}</span>
          <span class="radar-meta">${namespace}${status}${meta}</span>
        </button>
      `;
    }).join('');

    this.results.querySelectorAll<HTMLButtonElement>('.radar-row').forEach(row => {
      const index = Number(row.dataset.index);
      row.addEventListener('mouseenter', () => {
        this.activeIndex = index;
        this.render();
      });
      row.addEventListener('click', () => {
        this.activeIndex = index;
        this.selectActive();
      });
    });
    this.results.querySelector('.radar-row.active')?.scrollIntoView({ block: 'nearest' });
  }

  private renderScope() {
    const blips = this.visibleItems.slice(0, 18).map((item, index) => {
      const h = hash(item.id);
      const angle = ((h % 360) / 180) * Math.PI;
      const radius = 22 + ((h >>> 9) % 56);
      const x = 50 + Math.cos(angle) * radius;
      const y = 50 + Math.sin(angle) * radius;
      const active = index === this.activeIndex ? ' active' : '';
      return `<span class="radar-blip${active}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"></span>`;
    }).join('');

    this.scope.innerHTML = `
      <span class="radar-ring r1"></span>
      <span class="radar-ring r2"></span>
      <span class="radar-ring r3"></span>
      <span class="radar-cross x"></span>
      <span class="radar-cross y"></span>
      <span class="radar-sweep"></span>
      ${blips}
    `;
  }

  private move(delta: number) {
    if (this.visibleItems.length === 0) return;
    const next = this.activeIndex + delta;
    this.activeIndex = (next + this.visibleItems.length) % this.visibleItems.length;
    this.renderResults();
    this.renderScope();
  }

  private selectActive() {
    const item = this.visibleItems[this.activeIndex];
    if (!item) return;
    this.handlers.onSelect(item);
    this.close();
  }

  private onGlobalKey(e: KeyboardEvent) {
    const wantsRadar = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (!wantsRadar) return;
    if (!this.isOpen && isEditing(e.target)) return;
    e.preventDefault();
    this.toggle();
  }

  private onInputKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.selectActive();
    }
  }
}
