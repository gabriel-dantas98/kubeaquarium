export interface LabelTarget {
  uid: string;
  name: string;
  namespace: string;
  status: string;
  statusClass: 'ok' | 'warn' | 'err' | 'info';
  screen: { x: number; y: number; depth: number; offsetY: number };
  matched: boolean;
  focused: boolean;
}

export interface NamespaceLabelTarget {
  namespace: string;
  total: number;
  unhealthy: number;
  x: number;
  y: number;
  depth: number;
}

export interface LabelContext {
  mode: 'overview' | 'dive';
  filterActive: boolean;
  modalOpen: boolean;
  blockedRects: readonly DOMRectReadOnly[];
}

interface LabelEntry {
  element: HTMLDivElement;
  content: string;
  width: number;
  height: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const GAP = 4;
const POD_POOL_SIZE = 16;
const NAMESPACE_POOL_SIZE = 12;

/**
 * A fixed pool keeps transient stream identities from becoming retained DOM
 * identities. The active target order determines which reusable element draws
 * each frame, while text and measurements are updated only when necessary.
 */
export class LabelLayer {
  private readonly root: HTMLDivElement;
  private readonly pods: LabelEntry[];
  private readonly namespaces: LabelEntry[];
  private viewport = '';

  constructor() {
    const root = document.getElementById('labels');
    if (!(root instanceof HTMLDivElement)) throw new Error('Missing #labels layer');
    this.root = root;
    this.pods = this.createPool(POD_POOL_SIZE, 'pod-label');
    this.namespaces = this.createPool(NAMESPACE_POOL_SIZE, 'namespace-label');
  }

  render(targets: readonly LabelTarget[], context: LabelContext): void {
    this.updateViewport();
    this.hide(this.pods);
    if (context.modalOpen) return;

    const limit = context.filterActive ? POD_POOL_SIZE : context.mode === 'overview' ? 4 : 8;
    const selected = [...targets].sort(comparePods).slice(0, limit);
    const placed = context.blockedRects.map(fromDomRect);

    selected.forEach((target, index) => {
      const entry = this.pods[index];
      const content = target.focused
        ? `${target.name} · ${target.status}`
        : `${shorten(target.namespace)} · ${target.status}`;
      this.updatePod(entry, target, content);

      const positions = target.focused
        ? focusedPositions(target, entry)
        : [above(target.screen.x, target.screen.y - target.screen.offsetY, entry)];
      const rect = positions.find(position => fits(position, placed));
      if (!rect) return;

      this.place(entry, rect);
      placed.push(expand(rect, GAP));
    });
  }

  renderNamespaces(targets: readonly NamespaceLabelTarget[], context: LabelContext): void {
    this.updateViewport();
    this.hide(this.namespaces);
    if (context.modalOpen) return;

    const limit = context.mode === 'overview' ? NAMESPACE_POOL_SIZE : 4;
    const selected = [...targets]
      .sort((left, right) => left.depth - right.depth || left.namespace.localeCompare(right.namespace))
      .slice(0, limit);
    const placed = context.blockedRects.map(fromDomRect);
    for (const entry of this.pods) {
      if (entry.element.classList.contains('visible')) placed.push(expand(fromElement(entry.element), GAP));
    }

    selected.forEach((target, index) => {
      const entry = this.namespaces[index];
      const content = `${target.namespace} · ${target.total} pods · ${target.unhealthy} unhealthy`;
      this.updateNamespace(entry, target, content);

      const rect = above(target.x, target.y, entry);
      if (!fits(rect, placed)) return;

      this.place(entry, rect);
      placed.push(expand(rect, GAP));
    });
  }

  hideAll(): void {
    this.hide(this.pods);
    this.hide(this.namespaces);
  }

  private createPool(size: number, className: string): LabelEntry[] {
    return Array.from({ length: size }, () => {
      const element = document.createElement('div');
      element.className = className;
      this.root.appendChild(element);
      return { element, content: '', width: 0, height: 0 };
    });
  }

  private updateViewport(): void {
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    if (viewport === this.viewport) return;
    this.viewport = viewport;
    for (const entry of [...this.pods, ...this.namespaces]) {
      entry.width = 0;
      entry.height = 0;
    }
  }

  private updatePod(entry: LabelEntry, target: LabelTarget, content: string): void {
    if (entry.content !== content) {
      entry.element.textContent = content;
      entry.element.title = `${target.namespace}/${target.name}`;
      entry.content = content;
      entry.width = 0;
    }
    entry.element.className = `pod-label ${target.statusClass}${target.focused ? ' focused' : ''}${target.matched ? ' match' : ''}`;
    this.measure(entry);
  }

  private updateNamespace(entry: LabelEntry, target: NamespaceLabelTarget, content: string): void {
    if (entry.content !== content) {
      entry.element.textContent = content;
      entry.element.title = target.namespace;
      entry.content = content;
      entry.width = 0;
    }
    entry.element.className = 'namespace-label';
    this.measure(entry);
  }

  private measure(entry: LabelEntry): void {
    if (entry.width > 0 && entry.height > 0) return;
    entry.width = entry.element.offsetWidth;
    entry.height = entry.element.offsetHeight;
  }

  private hide(entries: readonly LabelEntry[]): void {
    for (const entry of entries) entry.element.classList.remove('visible');
  }

  private place(entry: LabelEntry, rect: Rect): void {
    entry.element.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    entry.element.classList.add('visible');
  }
}

function comparePods(left: LabelTarget, right: LabelTarget): number {
  return Number(right.focused) - Number(left.focused)
    || Number(right.matched) - Number(left.matched)
    || left.screen.depth - right.screen.depth
    || left.uid.localeCompare(right.uid);
}

function shorten(value: string): string {
  return value.length > 18 ? `${value.slice(0, 15)}…` : value;
}

function above(x: number, y: number, entry: LabelEntry): Rect {
  return { left: x - entry.width / 2, right: x + entry.width / 2, top: y - entry.height, bottom: y };
}

function focusedPositions(target: LabelTarget, entry: LabelEntry): Rect[] {
  const { x, y, offsetY } = target.screen;
  return [
    above(x, y - offsetY, entry),
    { left: x - entry.width / 2, right: x + entry.width / 2, top: y + offsetY, bottom: y + offsetY + entry.height },
    { left: x - offsetY - entry.width, right: x - offsetY, top: y - entry.height / 2, bottom: y + entry.height / 2 },
    { left: x + offsetY, right: x + offsetY + entry.width, top: y - entry.height / 2, bottom: y + entry.height / 2 },
  ];
}

function fits(rect: Rect, placed: readonly Rect[]): boolean {
  return onScreen(rect) && !placed.some(other => intersects(other, rect));
}

function onScreen(rect: Rect): boolean {
  return rect.left >= 8 && rect.right <= window.innerWidth - 8 && rect.top >= 8 && rect.bottom <= window.innerHeight - 8;
}

function intersects(left: Rect, right: Rect): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function expand(rect: Rect, amount: number): Rect {
  return { left: rect.left - amount, right: rect.right + amount, top: rect.top - amount, bottom: rect.bottom + amount };
}

function fromDomRect(rect: DOMRectReadOnly): Rect {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

function fromElement(element: HTMLElement): Rect {
  return fromDomRect(element.getBoundingClientRect());
}
