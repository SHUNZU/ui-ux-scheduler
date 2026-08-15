import { addBusinessDaysIso, businessDayDiff, inclusiveDaySpan, todayIso } from "./date";
import { DAILY_CAPACITY_HOURS, PRIORITY_ORDER, UNASSIGNED_OWNER } from "./constants";
import { DesignRequirement, OwnerLoad, ScheduledRequirement } from "../types";

type OwnerDayLoad = Record<string, Record<string, number>>;

export function scheduleRequirements(
  requirements: DesignRequirement[],
  baseDate = todayIso()
): ScheduledRequirement[] {
  const loads: OwnerDayLoad = {};
  const ordered = [...requirements].sort(compareRequirementPriority);

  return ordered.map((requirement) => {
    const ownerLane = requirement.owner || UNASSIGNED_OWNER;
    const preferredStart = requirement.manualOverride && requirement.startDate
      ? requirement.startDate
      : requirement.startDate || requirement.autoScheduledDate || baseDate;

    const durationDays = Math.max(1, Math.ceil(requirement.estimateHours / DAILY_CAPACITY_HOURS));
    const start = findAvailableStart(ownerLane, preferredStart, requirement.estimateHours, loads);
    const end = addBusinessDaysIso(start, durationDays - 1);
    const offsetHours = loads[ownerLane]?.[start] ?? 0;

    const overCapacity = allocate(ownerLane, start, requirement.estimateHours, loads);

    return {
      ...requirement,
      autoScheduledDate: start,
      ownerLane,
      scheduledStart: start,
      scheduledEnd: end,
      daySpan: inclusiveDaySpan(start, end),
      offsetHours,
      overCapacity,
      unassigned: ownerLane === UNASSIGNED_OWNER,
      delayedDays: calculateDelay(requirement.originalEndDate ?? requirement.dueDate, end),
      delayReason: buildDelayReason(requirement, end)
    };
  });
}

export function summarizeOwnerLoads(
  scheduled: ScheduledRequirement[],
  date = todayIso()
): OwnerLoad[] {
  const summary = new Map<string, OwnerLoad>();

  for (const item of scheduled) {
    const current = summary.get(item.ownerLane) ?? {
      owner: item.ownerLane,
      todayHours: 0,
      totalHours: 0,
      blockedCount: 0,
      activeCount: 0,
      rushCount: 0
    };

    current.totalHours += item.estimateHours;
    if (item.scheduledStart <= date && item.scheduledEnd >= date) {
      current.todayHours += Math.min(item.estimateHours, DAILY_CAPACITY_HOURS);
    }
    if (item.status === "阻塞") current.blockedCount += 1;
    if (item.status !== "已完成") current.activeCount += 1;
    if (item.isRush) current.rushCount += 1;
    summary.set(item.ownerLane, current);
  }

  return [...summary.values()].sort((a, b) => {
    if (a.owner === UNASSIGNED_OWNER) return -1;
    if (b.owner === UNASSIGNED_OWNER) return 1;
    return a.owner.localeCompare(b.owner, "zh-CN");
  });
}

function compareRequirementPriority(a: DesignRequirement, b: DesignRequirement): number {
  const activeDelta = Number(a.status === "已完成") - Number(b.status === "已完成");
  if (activeDelta !== 0) return activeDelta;

  const rushDelta = Number(b.isRush) - Number(a.isRush);
  if (rushDelta !== 0) return rushDelta;

  const sequenceDelta = a.sequence - b.sequence;
  if (sequenceDelta !== 0) return sequenceDelta;

  const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const dueA = a.dueDate ?? "9999-12-31";
  const dueB = b.dueDate ?? "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);

  return a.createdAt.localeCompare(b.createdAt);
}

function calculateDelay(originalEnd: string | undefined, scheduledEnd: string): number {
  if (!originalEnd || scheduledEnd <= originalEnd) return 0;
  return businessDayDiff(originalEnd, scheduledEnd);
}

function buildDelayReason(requirement: DesignRequirement, scheduledEnd: string): string {
  const originalEnd = requirement.originalEndDate ?? requirement.dueDate;
  if (!originalEnd || scheduledEnd <= originalEnd) return "";
  if (requirement.isRush) return "插单需求已优先排入队列";
  return "前置插单或同负责人产能占用导致顺延";
}

function findAvailableStart(
  owner: string,
  preferredStart: string,
  estimateHours: number,
  loads: OwnerDayLoad
): string {
  if (owner === UNASSIGNED_OWNER) return preferredStart;

  let cursor = preferredStart;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (hasCapacity(owner, cursor, estimateHours, loads)) return cursor;
    cursor = addBusinessDaysIso(cursor, 1);
  }
  return preferredStart;
}

function hasCapacity(owner: string, start: string, estimateHours: number, loads: OwnerDayLoad): boolean {
  let remaining = estimateHours;
  let cursor = start;

  while (remaining > 0) {
    const used = loads[owner]?.[cursor] ?? 0;
    const available = DAILY_CAPACITY_HOURS - used;
    if (available <= 0) return false;
    remaining -= Math.min(remaining, available);
    if (remaining > 0) cursor = addBusinessDaysIso(cursor, 1);
  }

  return true;
}

function allocate(owner: string, start: string, estimateHours: number, loads: OwnerDayLoad): boolean {
  loads[owner] = loads[owner] ?? {};
  let remaining = estimateHours;
  let cursor = start;
  let overCapacity = false;

  while (remaining > 0) {
    const used = loads[owner][cursor] ?? 0;
    const available = Math.max(0, DAILY_CAPACITY_HOURS - used);
    const chunk = owner === UNASSIGNED_OWNER ? remaining : Math.min(remaining, available || remaining);
    loads[owner][cursor] = used + chunk;
    if (loads[owner][cursor] > DAILY_CAPACITY_HOURS) overCapacity = true;
    remaining -= chunk;
    if (remaining > 0) cursor = addBusinessDaysIso(cursor, 1);
  }

  return overCapacity;
}
