const TABLE = "design_requirements";

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function listRequirements() {
  if (!hasSupabaseConfig()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return supabaseRequest(`${TABLE}?select=*&order=sequence.asc,created_at.asc`);
}

async function upsertRequirements(requirements) {
  if (!hasSupabaseConfig()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  if (requirements.length === 0) return [];

  return supabaseRequest(`${TABLE}?on_conflict=source_id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(requirements.map(toDbRow))
  });
}

async function updateRequirement(sourceId, patch) {
  if (!hasSupabaseConfig()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const rows = await supabaseRequest(`${TABLE}?source_id=eq.${encodeURIComponent(sourceId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(toDbPatch(patch))
  });

  return rows[0] ? fromDbRow(rows[0]) : null;
}

async function deleteRequirement(sourceId) {
  if (!hasSupabaseConfig()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return supabaseRequest(`${TABLE}?source_id=eq.${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation"
    }
  });
}

async function supabaseRequest(path, init = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${detail}`);
  }

  if (response.status === 204) return [];
  return response.json();
}

function toDbRow(item) {
  return {
    source_id: item.sourceId,
    name: item.name,
    project: item.project,
    source_url: item.sourceUrl,
    requester: item.requester,
    product_owner: item.productOwner,
    owner: item.owner,
    priority: item.priority,
    status: item.status,
    estimate_hours: item.estimateHours,
    sequence: item.sequence,
    is_rush: item.isRush,
    rush_reason: item.rushReason || null,
    start_date: item.startDate || null,
    due_date: item.dueDate || null,
    original_start_date: item.originalStartDate || null,
    original_end_date: item.originalEndDate || null,
    auto_scheduled_date: item.autoScheduledDate || null,
    synced_at: item.syncedAt || new Date().toISOString(),
    blocked_reason: item.blockedReason || null,
    note: item.note || null,
    created_at: item.createdAt || new Date().toISOString(),
    manual_override: Boolean(item.manualOverride)
  };
}

function toDbPatch(patch) {
  const row = {};
  const map = {
    name: "name",
    project: "project",
    sourceUrl: "source_url",
    requester: "requester",
    productOwner: "product_owner",
    owner: "owner",
    priority: "priority",
    status: "status",
    estimateHours: "estimate_hours",
    sequence: "sequence",
    isRush: "is_rush",
    rushReason: "rush_reason",
    startDate: "start_date",
    dueDate: "due_date",
    originalStartDate: "original_start_date",
    originalEndDate: "original_end_date",
    autoScheduledDate: "auto_scheduled_date",
    blockedReason: "blocked_reason",
    note: "note",
    manualOverride: "manual_override"
  };

  for (const [key, dbKey] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      row[dbKey] = patch[key];
    }
  }

  row.updated_at = new Date().toISOString();
  return row;
}

function fromDbRow(row) {
  return {
    id: row.source_id,
    sourceId: row.source_id,
    name: row.name,
    project: row.project,
    sourceUrl: row.source_url,
    requester: row.requester,
    productOwner: row.product_owner,
    owner: row.owner || "",
    priority: row.priority,
    status: row.status,
    estimateHours: row.estimate_hours,
    sequence: row.sequence,
    isRush: row.is_rush,
    rushReason: row.rush_reason || "",
    startDate: row.start_date || undefined,
    dueDate: row.due_date || undefined,
    originalStartDate: row.original_start_date || undefined,
    originalEndDate: row.original_end_date || undefined,
    autoScheduledDate: row.auto_scheduled_date || undefined,
    syncedAt: row.synced_at || undefined,
    blockedReason: row.blocked_reason || "",
    note: row.note || "",
    createdAt: row.created_at,
    manualOverride: row.manual_override
  };
}

module.exports = {
  fromDbRow,
  hasSupabaseConfig,
  deleteRequirement,
  listRequirements,
  updateRequirement,
  upsertRequirements
};
