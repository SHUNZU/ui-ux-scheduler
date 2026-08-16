import { addDays, differenceInCalendarDays, format, isBefore, parseISO } from "date-fns";

export const DATE_FORMAT = "yyyy-MM-dd";

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
    if (!isWeekend(cursor)) remaining -= 1;
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
    if (!isWeekend(cursor)) count += 1;
  }

  return count;
}

export function businessDaySpan(start: string, end: string): number {
  let cursor = parseISO(start);
  const last = parseISO(end);
  let count = 0;

  while (!isBefore(last, cursor)) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }

  return Math.max(1, count);
}

export function businessDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = parseISO(start);
  const last = parseISO(end);

  while (!isBefore(last, cursor)) {
    if (!isWeekend(cursor)) days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return days.length > 0 ? days : [start];
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
