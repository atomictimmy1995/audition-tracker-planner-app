/** Pure UTC date math on ISO date strings — no Date-locale pitfalls, no deps. */

import type { ISODate } from './types.ts';

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/** b - a in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return toUTC(a) < toUTC(b);
}

export function maxDate(dates: ISODate[]): ISODate {
  return dates.reduce((a, b) => (isBefore(a, b) ? b : a));
}

export function minDate(dates: ISODate[]): ISODate {
  return dates.reduce((a, b) => (isBefore(a, b) ? a : b));
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: ISODate): number {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

/** Monday of the ISO week containing `date` — usable as a week bucket key. */
export function weekKey(date: ISODate): ISODate {
  return addDays(date, -weekday(date));
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; !isBefore(end, d); d = addDays(d, 1)) out.push(d);
  return out;
}
