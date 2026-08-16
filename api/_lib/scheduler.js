const DAILY_CAPACITY_HOURS = 8;
const UNASSIGNED_OWNER = "待分配";
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
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

function scheduleRequirements(requirements, baseDate = todayIso()) {
  const loads = {};
  const ordered = applyDailyAverageEstimates(requirements, baseDate).sort(compareRequirementPriority);

  return ordered.map((requirement) => {
    const ownerLane = requirement.owner || UNASSIGNED_OWNER;
    const hasManualSchedule = Boolean(requirement.manualOverride && requirement.startDate);
    const preferredStart = requirement.manualOverride && requirement.startDate
      ? requirement.startDate
      : requirement.startDate || requirement.autoScheduledDate || baseDate;

    const durationDays = Math.max(1, Math.ceil(requirement.estimateHours / DAILY_CAPACITY_HOURS));
    const start = hasManualSchedule ? preferredStart : findAvailableStart(ownerLane, preferredStart, requirement.estimateHours, loads);
    const end = resolveScheduledEnd(requirement, start, durationDays);
    const estimateHours = resolveScheduledEstimate(requirement, start, end);
    const offsetHours = (loads[ownerLane] && loads[ownerLane][start]) || 0;
    const overCapacity = allocate(ownerLane, start, estimateHours, loads);

    return {
      ...requirement,
      estimateHours,
      autoScheduledDate: start,
      ownerLane,
      scheduledStart: start,
      scheduledEnd: end,
      daySpan: inclusiveDaySpan(start, end),
      offsetHours,
      overCapacity,
      unassigned: ownerLane === UNASSIGNED_OWNER,
      delayedDays: calculateDelay(end, baseDate, requirement.status),
      delayReason: buildDelayReason(requirement, end, baseDate)
    };
  });
}

function resolveScheduledEnd(requirement, start, durationDays) {
  if (requirement.manualOverride && requirement.dueDate && requirement.dueDate >= start) {
    return requirement.dueDate;
  }
  return addBusinessDaysIso(start, durationDays - 1);
}

function resolveScheduledEstimate(requirement, start, end) {
  return requirement.estimateHours;
}

function applyDailyAverageEstimates(requirements, baseDate) {
  const counts = new Map();
  const activeDays = new Map();

  for (const requirement of requirements) {
    if (!shouldUseAverageEstimate(requirement)) continue;
    const days = buildEstimateDays(requirement, baseDate);
    activeDays.set(requirement.sourceId, days);
    for (const day of days) {
      const key = buildEstimateGroupKey(requirement, day);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return requirements.map((requirement) => {
    if (!shouldUseAverageEstimate(requirement)) return requirement;
    const days = activeDays.get(requirement.sourceId) || buildEstimateDays(requirement, baseDate);
    const estimateHours = days.reduce((sum, day) => {
      const count = counts.get(buildEstimateGroupKey(requirement, day)) || 1;
      return sum + DAILY_CAPACITY_HOURS / count;
    }, 0);
    return {
      ...requirement,
      estimateHours: roundHours(estimateHours)
    };
  });
}

function shouldUseAverageEstimate(requirement) {
  return requirement.estimateHours === DAILY_CAPACITY_HOURS || hasManualDateRange(requirement);
}

function hasManualDateRange(requirement) {
  return Boolean(requirement.manualOverride && requirement.startDate && requirement.dueDate && requirement.dueDate >= requirement.startDate);
}

function buildEstimateDays(requirement, baseDate) {
  if (hasManualDateRange(requirement)) {
    return businessDaysBetween(requirement.startDate, requirement.dueDate);
  }
  return [requirement.startDate || requirement.autoScheduledDate || baseDate];
}

function buildEstimateGroupKey(requirement, date) {
  const owner = requirement.owner || UNASSIGNED_OWNER;
  return `${owner}:${date}`;
}

function roundHours(hours) {
  return Math.max(0.5, Math.round(hours * 10) / 10);
}

function compareRequirementPriority(a, b) {
  const activeDelta = Number(a.status === "已完成") - Number(b.status === "已完成");
  if (activeDelta !== 0) return activeDelta;

  const dateA = a.startDate || a.autoScheduledDate || "9999-12-31";
  const dateB = b.startDate || b.autoScheduledDate || "9999-12-31";
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const rushDelta = Number(b.isRush) - Number(a.isRush);
  if (rushDelta !== 0) return rushDelta;

  const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const dueA = a.dueDate || "9999-12-31";
  const dueB = b.dueDate || "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);

  const sequenceDelta = a.sequence - b.sequence;
  if (sequenceDelta !== 0) return sequenceDelta;

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
    if (isWorkday(cursor)) remaining -= 1;
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
    if (isWorkday(cursor)) count += 1;
  }

  return count;
}

function businessDaySpan(start, end) {
  const cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  let count = 0;

  while (cursor <= last) {
    if (isWorkday(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return Math.max(1, count);
}

function businessDaysBetween(start, end) {
  const cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  const days = [];

  while (cursor <= last) {
    if (isWorkday(cursor)) days.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days.length > 0 ? days : [start];
}

function calculateDelay(scheduledEnd, baseDate, status) {
  if (status === "已完成" || baseDate <= scheduledEnd) return 0;
  return businessDayDiff(scheduledEnd, baseDate);
}

function buildDelayReason(requirement, scheduledEnd, baseDate) {
  if (requirement.status === "已完成" || baseDate <= scheduledEnd) return "";
  return "已超过排期结束日期且需求未完成";
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

function isWorkday(date) {
  const iso = toIsoDate(date);
  if (ADJUSTED_WORKDAYS.has(iso)) return true;
  if (HOLIDAYS.has(iso)) return false;
  return !isWeekend(date);
}

module.exports = { scheduleRequirements };
