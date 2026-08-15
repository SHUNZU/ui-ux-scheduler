const DESIGN_KEYWORDS = ["设计", "ui", "ux", "视觉", "交互", "动效", "原型"];

function isDesignWorkItem(item) {
  const searchable = [
    item.type,
    item.designOwner,
    item.assignee,
    item.title,
    ...(item.labels || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return DESIGN_KEYWORDS.some((keyword) => searchable.includes(keyword.toLowerCase()));
}

function normalizeWorkItem(item, syncedAt = new Date().toISOString()) {
  return {
    id: item.id,
    sourceId: item.id,
    name: item.title,
    project: item.project || "未归属项目",
    sourceUrl: item.url,
    requester: item.creator,
    productOwner: item.productOwner || item.creator,
    owner: item.designOwner || item.assignee || "",
    priority: normalizePriority(item.priority),
    status: normalizeStatus(item.status),
    estimateHours: clampHours(item.estimateHours),
    sequence: item.sequence || 999,
    isRush: Boolean(item.isRush),
    rushReason: item.rushReason || "",
    startDate: item.startDate || null,
    dueDate: item.dueDate || null,
    originalStartDate: item.originalStartDate || item.startDate || item.dueDate || null,
    originalEndDate: item.originalEndDate || item.dueDate || null,
    syncedAt,
    blockedReason: item.blockedReason || "",
    note: item.note || "",
    createdAt: item.createdAt || syncedAt,
    manualOverride: Boolean(item.manualOverride)
  };
}

function normalizePriority(priority) {
  const value = String(priority || "P2").toUpperCase();
  if (value.includes("P0") || value.includes("最高") || value.includes("紧急")) return "P0";
  if (value.includes("P1") || value.includes("高")) return "P1";
  if (value.includes("P3") || value.includes("低")) return "P3";
  return "P2";
}

function normalizeStatus(status) {
  const value = String(status || "");
  if (value.includes("阻塞") || value.includes("暂停")) return "阻塞";
  if (value.includes("验收") || value.includes("评审完成")) return "待验收";
  if (value.includes("进行") || value.includes("设计中")) return "设计中";
  if (value.includes("完成") || value.includes("关闭")) return "已完成";
  if (value.includes("评审")) return "待评审";
  return "待设计";
}

function clampHours(hours) {
  if (!hours || Number.isNaN(Number(hours))) return 8;
  return Math.min(80, Math.max(1, Math.round(Number(hours))));
}

module.exports = { isDesignWorkItem, normalizeWorkItem };
