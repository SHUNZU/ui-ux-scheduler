import { addDays, differenceInCalendarDays, format, isBefore, parseISO } from "date-fns";

export const DATE_FORMAT = "yyyy-MM-dd";
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"
]);
const ADJUSTED_WORKDAYS = new Set(["2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]);

export function todayIso(): string {
  return format(new Date(), DATE_FORMAT);
}

export function toIsoDate(value: Date | string): string {
  return format(typeof value === "string" ? parseISO(value) : value, DATE_FORMAT);
}

export function addBusinessDaysIso(date: string, days: number): string {
  let cursor = parseISO(date);
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isWorkday(cursor)) remaining -= 1;
  }
  return toIsoDate(cursor);
}

export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = parseISO(start);
  const last = parseISO(end);
  while (!isBefore(last, cursor)) {
    days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function inclusiveDaySpan(start: string, end: string): number {
  return Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
}

export function businessDayDiff(start: string, end: string): number {
  let cursor = parseISO(start);
  const last = parseISO(end);
  let count = 0;

  while (isBefore(cursor, last)) {
    cursor = addDays(cursor, 1);
    if (isWorkday(cursor)) count += 1;
  }

  return count;
}

export function businessDaySpan(start: string, end: string): number {
  let cursor = parseISO(start);
  const last = parseISO(end);
  let count = 0;

  while (!isBefore(last, cursor)) {
    if (isWorkday(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }

  return Math.max(1, count);
}

export function businessDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = parseISO(start);
  const last = parseISO(end);

  while (!isBefore(last, cursor)) {
    if (isWorkday(cursor)) days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return days.length > 0 ? days : [start];
}

export function isWorkingDay(date: string): boolean {
  return isWorkday(parseISO(date));
}

function isWorkday(date: Date): boolean {
  const iso = toIsoDate(date);
  if (ADJUSTED_WORKDAYS.has(iso)) return true;
  if (HOLIDAYS.has(iso)) return false;
  return !isWeekend(date);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
