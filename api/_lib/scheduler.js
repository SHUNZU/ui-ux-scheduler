const DAILY_CAPACITY_HOURS = 8;
const UNASSIGNED_OWNER = "待分配";
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

function scheduleRequirements(requirements, baseDate = todayIso()) {
  const loads = {};
  const ordered = [...requirements].sort(compareRequirementPriority);

  return ordered.map((requirement) => {
    const ownerLane = requirement.owner || UNASSIGNED_OWNER;
    const preferredStart = requirement.manualOverride && requirement.startDate
      ? requirement.startDate
      : requirement.startDate || requirement.autoScheduledDate || baseDate;

    const durationDays = Math.max(1, Math.ceil(requirement.estimateHours / DAILY_CAPACITY_HOURS));
    const start = findAvailableStart(ownerLane, preferredStart, requirement.estimateHours, loads);
    const end = addBusinessDaysIso(start, durationDays - 1);
    const offsetHours = (loads[ownerLane] && loads[ownerLane][start]) || 0;
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
      delayedDays: calculateDelay(requirement.originalEndDate || requirement.dueDate, end),
      delayReason: buildDelayReason(requirement, end)
    };
  });
}

function compareRequirementPriority(a, b) {
  const activeDelta = Number(a.status === "已完成") - Number(b.status === "已完成");
  if (activeDelta !== 0) return activeDelta;

  const rushDelta = Number(b.isRush) - Number(a.isRush);
  if (rushDelta !== 0) return rushDelta;

  const sequenceDelta = a.sequence - b.sequence;
  if (sequenceDelta !== 0) return sequenceDelta;

  const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const dueA = a.dueDate || "9999-12-31";
  const dueB = b.dueDate || "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);

  return a.createdAt.localeCompare(b.createdAt);
}

function findAvailableStart(owner, preferredStart, estimateHours, loads) {
  if (owner === UNASSIGNED_OWNER) return preferredStart;

  let cursor = preferredStart;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (hasCapacity(owner, cursor, estimateHours, loads)) return cursor;
    cursor = addBusinessDaysIso(cursor, 1);
  }
  return preferredStart;
}

function hasCapacity(owner, start, estimateHours, loads) {
  let remaining = estimateHours;
  let cursor = start;

  while (remaining > 0) {
    const used = (loads[owner] && loads[owner][cursor]) || 0;
    const available = DAILY_CAPACITY_HOURS - used;
    if (available <= 0) return false;
    remaining -= Math.min(remaining, available);
    if (remaining > 0) cursor = addBusinessDaysIso(cursor, 1);
  }

  return true;
}

function allocate(owner, start, estimateHours, loads) {
  loads[owner] = loads[owner] || {};
  let remaining = estimateHours;
  let cursor = start;
  let overCapacity = false;

  while (remaining > 0) {
    const used = loads[owner][cursor] || 0;
    const available = Math.max(0, DAILY_CAPACITY_HOURS - used);
    const chunk = owner === UNASSIGNED_OWNER ? remaining : Math.min(remaining, available || remaining);
    loads[owner][cursor] = used + chunk;
    if (loads[owner][cursor] > DAILY_CAPACITY_HOURS) overCapacity = true;
    remaining -= chunk;
    if (remaining > 0) cursor = addBusinessDaysIso(cursor, 1);
  }

  return overCapacity;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addBusinessDaysIso(date, days) {
  const cursor = parseIsoDate(date);
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return toIsoDate(cursor);
}

function inclusiveDaySpan(start, end) {
  return Math.max(1, Math.round((parseIsoDate(end) - parseIsoDate(start)) / 86400000) + 1);
}

function businessDayDiff(start, end) {
  const cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  let count = 0;

  while (cursor < last) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }

  return count;
}

function calculateDelay(originalEnd, scheduledEnd) {
  if (!originalEnd || scheduledEnd <= originalEnd) return 0;
  return businessDayDiff(originalEnd, scheduledEnd);
}

function buildDelayReason(requirement, scheduledEnd) {
  const originalEnd = requirement.originalEndDate || requirement.dueDate;
  if (!originalEnd || scheduledEnd <= originalEnd) return "";
  if (requirement.isRush) return "插单需求已优先排入队列";
  return "前置插单或同负责人产能占用导致顺延";
}

function parseIsoDate(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

module.exports = { scheduleRequirements };
