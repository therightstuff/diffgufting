export class BoundedQueue {
  constructor({ concurrency = 1, capacity = 1 } = {}) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(capacity) || capacity < concurrency) throw new Error('Queue capacity must be at least its positive concurrency');
    this.concurrency = concurrency; this.capacity = capacity; this.running = 0; this.pending = []; this.waiters = [];
  }
  async add(work) {
    while (this.running + this.pending.length >= this.capacity) await new Promise(resolve => this.waiters.push(resolve));
    return new Promise((resolve, reject) => { this.pending.push({ work, resolve, reject }); this.drain(); });
  }
  drain() {
    while (this.running < this.concurrency && this.pending.length) {
      const next = this.pending.shift(); this.running++;
      Promise.resolve().then(next.work).then(next.resolve, next.reject).finally(() => { this.running--; this.waiters.shift()?.(); this.drain(); });
    }
  }
  async idle() { while (this.running || this.pending.length) await new Promise(resolve => this.waiters.push(resolve)); }
}
