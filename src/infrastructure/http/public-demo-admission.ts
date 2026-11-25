const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

export class PublicDemoAdmission {
  private readonly admissions: number[] = [];
  constructor(private readonly now = Date.now) {}

  // Only this single process, clock and queue decide admission, regardless of caller.
  retryAfterSeconds(): number | null {
    const now = this.now();
    while (this.admissions.length && this.admissions[0] <= now - WINDOW_MS) this.admissions.shift();
    if (this.admissions.length >= MAX_REQUESTS) return Math.max(1, Math.ceil((this.admissions[0] + WINDOW_MS - now) / 1000));
    this.admissions.push(now);
    return null;
  }
}
