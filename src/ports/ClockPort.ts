export interface ClockPort { now(): string; timeZone(): string; wallClock(instant: string, timeZone: string): string; }
