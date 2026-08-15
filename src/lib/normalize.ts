import { DesignRequirement, ProjectWorkItem, RequirementPriority, RequirementStatus } from "../types";

const DESIGN_KEYWORDS = ["设计", "ui", "ux", "视觉", "交互", "动效", "原型"];

export function isDesignWorkItem(item: ProjectWorkItem): boolean {
  const searchable = [
    item.type,
    item.designOwner,
    item.assignee,
    item.title,
    ...(item.labels ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return DESIGN_KEYWORDS.some((keyword) => searchable.includes(keyword.toLowerCase()));
}

export function normalizeWorkItem(item: ProjectWorkItem, syncedAt = new Date().toISOString()): DesignRequirement {
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
    sequence: item.sequence ?? 999,
    isRush: Boolean(item.isRush),
    rushReason: item.rushReason,
    dueDate: item.dueDate,
    originalStartDate: item.dueDate,
    originalEndDate: item.dueDate,
    syncedAt,
    createdAt: item.createdAt
  };
}

export function normalizePriority(priority?: string): RequirementPriority {
  const value = (priority ?? "P2").toUpperCase();
  if (value.includes("P0") || value.includes("最高") || value.includes("紧急")) return "P0";
  if (value.includes("P1") || value.includes("高")) return "P1";
  if (value.includes("P3") || value.includes("低")) return "P3";
  return "P2";
}

export function normalizeStatus(status?: string): RequirementStatus {
  const value = status ?? "";
  if (value.includes("阻塞") || value.includes("暂停")) return "阻塞";
  if (value.includes("验收") || value.includes("评审完成")) return "待验收";
  if (value.includes("进行") || value.includes("设计中")) return "设计中";
  if (value.includes("完成") || value.includes("关闭")) return "已完成";
  if (value.includes("评审")) return "待评审";
  return "待设计";
}

function clampHours(hours?: number): number {
  if (!hours || Number.isNaN(hours)) return 8;
  return Math.min(80, Math.max(1, Math.round(hours)));
}
