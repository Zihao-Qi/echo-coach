import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
const exec = promisify(execFile);

type Sample = { elapsedMs: number; sampleStartedAt: number; sampleEndedAt: number; phase: string; totalRssMiB: number; byRoleMiB: Record<string, number>; byProcessMiB: Record<string, number> };

// Never let exited spare renderers or a shrinking process cancel growth elsewhere.
export function positiveProcessGrowth(baseline: Record<string, number>, current: Record<string, number>) {
  return Object.entries(current).reduce((sum, [pid, rss]) => sum + Math.max(0, rss - (baseline[pid] || 0)), 0);
}

// Only the isolated browser's descendants are inspected. Never dump other apps'
// argv/environment. RSS sums double-count shared pages: this is conservative,
// sampled process memory, not unique physical memory or an instantaneous peak.
export class BrowserMemorySampler {
  readonly samples: Sample[] = [];
  readonly processes = new Map<number, string>();
  private active = false;
  private stopped = false;
  private task: Promise<void> | undefined;
  private phaseName = "idle";
  private intervalMs = 100;
  private readonly started = performance.now();
  constructor(private readonly rootPid: number) {}

  private async sample() {
    const phase = this.phaseName;
    const sampleStartedAt = Date.now();
    const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,rss="], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 });
    const sampleEndedAt = Date.now();
    const rows = stdout.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
    const included = new Set([this.rootPid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, parent] of rows) if (included.has(parent) && !included.has(pid)) { included.add(pid); changed = true; }
    }
    const present = rows.filter(([pid]) => included.has(pid));
    if (!present.some(([pid]) => pid === this.rootPid)) throw new Error("Isolated Chrome exited during sampling.");
    const unknown = present.filter(([pid]) => !this.processes.has(pid)).map(([pid]) => pid);
    if (unknown.length) {
      const args = await exec("ps", ["-p", unknown.join(","), "-o", "pid=,args="], { timeout: 3000 }).catch((error) => {
        // Short-lived Chrome helpers can exit between tree sampling and argv lookup.
        if (error.code === 1 && !error.stderr?.trim()) return { stdout: error.stdout || "" };
        throw error;
      });
      for (const line of args.stdout.trim().split("\n")) {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        if (!match) continue;
        const pid = Number(match[1]); const command = match[2];
        this.processes.set(pid, pid === this.rootPid ? "browser" : command.includes("AudioService") ? "audio-service" :
          command.includes("--type=renderer") ? "renderer" : command.includes("--type=gpu-process") ? "gpu" : "other-browser-helper");
      }
    }
    const byRoleMiB: Record<string, number> = {};
    const byProcessMiB: Record<string, number> = {};
    for (const [pid, , rss] of present) {
      byProcessMiB[pid] = rss / 1024;
      const role = this.processes.get(pid) || "unclassified";
      byRoleMiB[role] = (byRoleMiB[role] || 0) + rss / 1024;
    }
    this.samples.push({ elapsedMs: performance.now() - this.started, sampleStartedAt, sampleEndedAt, phase,
      totalRssMiB: present.reduce((total, row) => total + row[2] / 1024, 0), byRoleMiB, byProcessMiB });
  }

  async start() {
    if (this.stopped) throw new Error("Memory sampler is stopped.");
    await this.sample();
    if (this.stopped) throw new Error("Memory sampler stopped during startup.");
    this.active = true;
    this.task = (async () => {
      while (this.active) {
        await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
        if (this.active) await this.sample();
      }
    })();
    // Retain the rejection for stop(), without an unhandled rejection mid-capture.
    void this.task.catch(() => { this.active = false; });
  }
  async phase(name: string, intervalMs = 100) {
    if (this.stopped) throw new Error("Memory sampler is stopped.");
    this.phaseName = name; this.intervalMs = intervalMs;
    await this.sample();
  }
  async stop() { this.stopped = true; this.active = false; await this.task; }
}
