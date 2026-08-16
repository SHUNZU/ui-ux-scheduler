const DAILY_CAPACITY_HOURS = 8;
const UNASSIGNED_OWNER = "待分配";
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

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

function applyDailyAverageEstimates(requirements, baseDate) {
  const counts = new Map();

  for (const requirement of requirements) {
    if (!shouldUseAverageEstimate(requirement)) continue;
    const key = buildEstimateGroupKey(requirement, baseDate);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return requirements.map((requirement) => {
    if (!shouldUseAverageEstimate(requirement)) return requirement;
    const count = counts.get(buildEstimateGroupKey(requirement, baseDate)) || 1;
    return {
      ...requirement,
      estimateHours: roundHours(DAILY_CAPACITY_HOURS / count)
    };
  });
}

function shouldUseAverageEstimate(requirement) {
  return requirement.estimateHours === DAILY_CAPACITY_HOURS;
}

function buildEstimateGroupKey(requirement, baseDate) {
  const owner = requirement.owner || UNASSIGNED_OWNER;
  const date = requirement.startDate || requirement.autoScheduledDate || baseDate;
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

module.exports = { scheduleRequirements };
