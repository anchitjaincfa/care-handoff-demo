import { assertTimeZone, toUtcInstant, wallClockForInstant } from "@/src/domain/time";
import type { ClockPort } from "@/src/ports/ClockPort";

export type BrowserClockOptions = {
  now?: () => Date | string;
  timeZone?: () => string;
};

export class BrowserClockPort implements ClockPort {
  private readonly current: () => Date | string;
  private readonly currentTimeZone: () => string;

  constructor(options: BrowserClockOptions = {}) {
    this.current = options.now ?? (() => new Date());
    this.currentTimeZone = options.timeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }

  now(): string {
    const value = this.current();
    return toUtcInstant(value instanceof Date ? value.toISOString() : value);
  }

  timeZone(): string {
    return assertTimeZone(this.currentTimeZone());
  }

  wallClock(instant: string, timeZone: string): string {
    return wallClockForInstant(instant, timeZone);
  }
}
