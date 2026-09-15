/** Bounded raw rAF measurements; simulation clamps never affect these samples. */
export class FrameMetrics {
  private values = new Float64Array(3600);
  private cursor = 0;
  private count = 0;
  private last: number | undefined;
  reset() { this.cursor = this.count = 0; this.last = undefined; }
  record(timestamp: number) {
    if (this.last !== undefined) {
      this.values[this.cursor] = timestamp - this.last;
      this.cursor = (this.cursor + 1) % this.values.length;
      this.count = Math.min(this.count + 1, this.values.length);
    }
    this.last = timestamp;
  }
  snapshot() {
    const values = Array.from(this.values.subarray(0, this.count)).sort((a,b) => a-b);
    const percentile = (p: number) => values[Math.ceil(values.length*p)-1] ?? 0;
    return {samples:this.count,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),over50Ms:values.filter(v=>v>50).length};
  }
}
