import { DesignRequirement, ProjectWorkItem } from "../types";
import { isDesignWorkItem, normalizeWorkItem } from "../lib/normalize";
import { mockProjectItems } from "./mockData";

export interface SyncResult {
  requirements: DesignRequirement[];
  syncedAt: string;
  ignoredCount: number;
}

export async function syncProjectRequirements(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const cloud = await fetchCloudRequirements();
  if (cloud) return cloud;

  const items = await fetchProjectItems();
  const designItems = items.filter(isDesignWorkItem);

  return {
    requirements: designItems.map((item) => normalizeWorkItem(item, syncedAt)),
    syncedAt,
    ignoredCount: items.length - designItems.length
  };
}

export async function triggerProjectSync(editKey = "", sourceUrl = ""): Promise<SyncResult> {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getEditHeaders(editKey)
    },
    body: JSON.stringify({ sourceUrl: sourceUrl.trim() || undefined })
  });

  if (!response.ok) {
    throw new Error(`云端同步失败：${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    requirements?: DesignRequirement[];
    imported?: number;
    ignored?: number;
    syncedAt?: string;
  };

  return {
    requirements: payload.requirements ?? [],
    syncedAt: payload.syncedAt ?? new Date().toISOString(),
    ignoredCount: payload.ignored ?? 0
  };
}

export async function saveRequirementPatch(sourceId: string, patch: Partial<DesignRequirement>, editKey = ""): Promise<DesignRequirement[] | null> {
  const response = await fetch("/api/updateRequirement", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getEditHeaders(editKey)
    },
    body: JSON.stringify({ sourceId, patch })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "保存失败"));
  }
  const payload = (await response.json()) as { requirements?: DesignRequirement[] };
  return payload.requirements ?? null;
}

export async function createManualRequirement(requirement: Partial<DesignRequirement>, editKey = ""): Promise<DesignRequirement[] | null> {
  const response = await fetch("/api/createRequirement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getEditHeaders(editKey)
    },
    body: JSON.stringify(requirement)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "新增需求失败"));
  }
  const payload = (await response.json()) as { requirements?: DesignRequirement[] };
  return payload.requirements ?? null;
}

export async function deleteCloudRequirement(sourceId: string, editKey = ""): Promise<DesignRequirement[] | null> {
  const response = await fetch(`/api/deleteRequirement?sourceId=${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
    headers: getEditHeaders(editKey)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "删除失败"));
  }
  const payload = (await response.json()) as { requirements?: DesignRequirement[] };
  return payload.requirements ?? null;
}

async function fetchCloudRequirements(): Promise<SyncResult | null> {
  try {
    const response = await fetch("/api/requirements");
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      requirements?: DesignRequirement[];
      source?: string;
      syncedAt?: string;
      message?: string;
    };

    if (payload.source !== "supabase" || !payload.requirements || payload.requirements.length === 0) return null;

    return {
      requirements: payload.requirements,
      syncedAt: payload.syncedAt ?? new Date().toISOString(),
      ignoredCount: 0
    };
  } catch {
    return null;
  }
}

async function fetchProjectItems(): Promise<ProjectWorkItem[]> {
  const endpoint = import.meta.env?.VITE_FEISHU_SYNC_ENDPOINT;
  if (!endpoint) return mockProjectItems;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`飞书项目同步失败：${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { items: ProjectWorkItem[] };
  return payload.items;
}

function getEditHeaders(editKey: string): HeadersInit {
  return editKey ? { Authorization: `Bearer ${editKey}`, "X-Edit-Key": editKey } : {};
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ? `${fallback}：${payload.error}` : `${fallback}：${response.status} ${response.statusText}`;
  } catch {
    return `${fallback}：${response.status} ${response.statusText}`;
  }
}
