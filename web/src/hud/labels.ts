/**
 * Floating HTML labels above whales.
 *
 * Labels are expensive (1 div per label, layout, repaint). We only ever show:
 *   - the focused whale (if any)
 *   - the top-N nearest whales to the camera that are inside the frustum
 *   - all currently-matched whales when a filter is active (capped to a max)
 *
 * Labels are pulled from a small pool to avoid creating/destroying DOM nodes.
 */

const NEAREST_N = 14;
const MATCH_CAP = 60;
const LABEL_GAP = 4;

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

export class LabelLayer {
  private root = document.getElementById('labels') as HTMLDivElement;
  private pool: HTMLDivElement[] = [];
  private inUse: HTMLDivElement[] = [];

  render(targets: LabelTarget[]) {
    // Decide how many we'll actually render this frame.
    const sorted = [...targets].sort((a, b) => {
      // Focused first, then matched, then nearest.
      if (a.focused !== b.focused) return a.focused ? -1 : 1;
      if (a.matched !== b.matched) return a.matched ? -1 : 1;
      return a.screen.depth - b.screen.depth;
    });

    let cap = NEAREST_N;
    if (targets.some(t => t.matched)) cap = Math.min(MATCH_CAP, sorted.filter(t => t.matched).length + 4);

    const candidates = sorted.slice(0, cap);

    const labels = [...this.root.querySelectorAll<HTMLDivElement>('.pod-label')];
    while (labels.length < candidates.length) {
      const div = document.createElement('div');
      div.className = 'pod-label';
      this.root.appendChild(div);
      labels.push(div);
    }

    for (const d of labels) resetLabel(d);
    this.inUse.length = 0;
    const available = labels;
    this.pool = [];

    const placed: Rect[] = [];
    for (const t of candidates) {
      const div = available.pop();
      if (!div) break;
      const left = t.screen.x;
      const top = t.screen.y - t.screen.offsetY;
      div.style.left = left + 'px';
      div.style.top = top + 'px';
      div.innerHTML = `<span class="ns">${escapeHtml(t.namespace)}</span><span class="status">${escapeHtml(t.status)}</span>`;
      div.title = `${t.namespace}/${t.name}`;
      div.classList.remove('visible', 'focused', 'match', 'ok', 'warn', 'err', 'info');
      div.classList.add(t.statusClass);
      if (t.focused) div.classList.add('focused');
      if (t.matched) div.classList.add('match');

      const rect = measureLabel(div, left, top);
      if (!t.focused && placed.some(p => intersects(p, rect))) {
        resetLabel(div);
        this.pool.push(div);
        continue;
      }

      placed.push(rect);
      this.inUse.push(div);
      div.classList.add('visible');
    }

    for (const div of available) {
      resetLabel(div);
      this.pool.push(div);
    }
  }

  hideAll() {
    for (const d of this.inUse) {
      resetLabel(d);
      this.pool.push(d);
    }
    this.inUse.length = 0;
    this.pool = [...new Set(this.pool)];
    for (const d of this.pool) resetLabel(d);
  }
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function measureLabel(div: HTMLDivElement, left: number, top: number): Rect {
  const width = div.offsetWidth;
  const height = div.offsetHeight;
  return {
    left: left - width / 2 - LABEL_GAP,
    right: left + width / 2 + LABEL_GAP,
    top: top - height - LABEL_GAP,
    bottom: top + LABEL_GAP,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function resetLabel(div: HTMLDivElement) {
  div.classList.remove('visible', 'focused', 'match');
  div.style.left = '';
  div.style.top = '';
  div.title = '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
