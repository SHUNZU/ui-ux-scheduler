import { RequirementPriority, RequirementStatus } from "../types";

export const FIELD_NAMES = {
  name: "需求名称",
  project: "所属项目",
  sourceId: "需求来源 ID",
  sourceUrl: "需求链接",
  requester: "需求下发人",
  productOwner: "产品负责人",
  owner: "设计负责人",
  priority: "优先级",
  status: "状态",
  estimateHours: "预计设计工时",
  sequence: "排期顺序",
  isRush: "是否插单",
  rushReason: "插单原因",
  startDate: "开始日期",
  dueDate: "截止日期",
  originalStartDate: "原排期开始",
  originalEndDate: "原排期结束",
  autoScheduledDate: "自动排期日期",
  delayedDays: "延期工作日",
  delayReason: "延期原因",
  syncedAt: "同步时间",
  blockedReason: "阻塞原因",
  note: "备注"
} as const;

export const STATUS_COLORS: Record<RequirementStatus, string> = {
  待评审: "#7c8ea3",
  待设计: "#2f80ed",
  设计中: "#00a870",
  待验收: "#a065d8",
  已完成: "#6b7280",
  阻塞: "#e5484d"
};

export const PRIORITY_ORDER: Record<RequirementPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3
};

export const STATUS_OPTIONS: RequirementStatus[] = [
  "待评审",
  "待设计",
  "设计中",
  "待验收",
  "已完成",
  "阻塞"
];

export const PRIORITY_OPTIONS: RequirementPriority[] = ["P0", "P1", "P2", "P3"];

export const UNASSIGNED_OWNER = "待分配";
export const DAILY_CAPACITY_HOURS = 8;
