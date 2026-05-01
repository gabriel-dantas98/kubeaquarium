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

export interface LabelTarget {
  uid: string;
  name: string;
  namespace: string;
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

    const visible = sorted.slice(0, cap);

    // Recycle / size pool
    while (this.pool.length + this.inUse.length < visible.length) {
      const div = document.createElement('div');
      div.className = 'pod-label';
      this.root.appendChild(div);
      this.pool.push(div);
    }

    // Return inUse to pool
    for (const d of this.inUse) {
      d.classList.remove('visible', 'focused', 'match');
      this.pool.push(d);
    }
    this.inUse.length = 0;

    // Apply
    for (const t of visible) {
      const div = this.pool.pop();
      if (!div) break;
      this.inUse.push(div);
      const left = t.screen.x;
      const top = t.screen.y - t.screen.offsetY;
      div.style.left = left + 'px';
      div.style.top = top + 'px';
      div.innerHTML = `<span class="ns">${escapeHtml(t.namespace)}</span>${escapeHtml(t.name)}`;
      div.classList.add('visible');
      if (t.focused) div.classList.add('focused');
      if (t.matched) div.classList.add('match');
    }
  }

  hideAll() {
    for (const d of this.inUse) {
      d.classList.remove('visible', 'focused', 'match');
      this.pool.push(d);
    }
    this.inUse.length = 0;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
