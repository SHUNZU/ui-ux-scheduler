export type RequirementStatus =
  | "待评审"
  | "待设计"
  | "设计中"
  | "待验收"
  | "已完成"
  | "阻塞";

export type RequirementPriority = "P0" | "P1" | "P2" | "P3";

export interface DesignRequirement {
  id: string;
  sourceId: string;
  name: string;
  project: string;
  sourceUrl: string;
  requester: string;
  productOwner: string;
  owner: string;
  priority: RequirementPriority;
  status: RequirementStatus;
  estimateHours: number;
  sequence: number;
  isRush: boolean;
  rushReason?: string;
  startDate?: string;
  dueDate?: string;
  originalStartDate?: string;
  originalEndDate?: string;
  autoScheduledDate?: string;
  syncedAt?: string;
  blockedReason?: string;
  note?: string;
  createdAt: string;
  manualOverride?: boolean;
}

export interface ProjectWorkItem {
  id: string;
  title: string;
  project?: string;
  url: string;
  creator: string;
  productOwner?: string;
  assignee?: string;
  priority?: string;
  status?: string;
  estimateHours?: number;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
  labels?: string[];
  type?: string;
  designOwner?: string;
  sequence?: number;
  isRush?: boolean;
  rushReason?: string;
  originalStartDate?: string;
  originalEndDate?: string;
}

export interface ScheduledRequirement extends DesignRequirement {
  ownerLane: string;
  scheduledStart: string;
  scheduledEnd: string;
  daySpan: number;
  offsetHours: number;
  overCapacity: boolean;
  unassigned: boolean;
  delayedDays: number;
  delayReason: string;
}

export interface OwnerLoad {
  owner: string;
  todayHours: number;
  totalHours: number;
  blockedCount: number;
  activeCount: number;
  rushCount: number;
}

export interface Filters {
  requesters: string[];
  owners: string[];
  statuses: string[];
  priorities: string[];
  startDate: string;
  endDate: string;
  overloadedOnly: boolean;
  blockedOnly: boolean;
  rushOnly: boolean;
  delayedOnly: boolean;
}
