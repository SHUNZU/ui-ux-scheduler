const { fetchFeishuWorkItems } = require("./_lib/feishu");
const { hasEditAccess } = require("./_lib/auth");
const { isDesignWorkItem, normalizeWorkItem } = require("./_lib/normalize");
const { scheduleRequirements } = require("./_lib/scheduler");
const { deleteRequirements, fromDbRow, listRequirements, upsertRequirements } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasEditAccess(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const syncedAt = new Date().toISOString();
    const items = await fetchFeishuWorkItems({ sourceUrl: req.body?.sourceUrl || "" });
    const designItems = items.filter(isDesignWorkItem);
    const normalized = designItems.map((item) => normalizeWorkItem(item, syncedAt));
    const existingRows = await listRequirements();
    const existing = existingRows.map(fromDbRow);
    const merged = mergeSyncedRequirements(existing, normalized);
    const duplicateSourceIds = [
      ...findLegacyLinkDuplicates(existing, normalized),
      ...findPlaceholderRows(existing)
    ];

    if (duplicateSourceIds.length > 0) {
      await deleteRequirements(duplicateSourceIds);
    }
    await upsertRequirements(merged);
    const rows = await listRequirements();
    const requirements = rows.map(fromDbRow);

    return res.status(200).json({
      syncedAt,
      imported: normalized.length,
      ignored: items.length - normalized.length,
      requirements,
      scheduled: scheduleRequirements(requirements)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function findLegacyLinkDuplicates(existing, incoming) {
  const incomingRecordIds = new Set(incoming.map((item) => recordIdFromSourceId(item.sourceId)).filter(Boolean));
  return existing
    .filter((item) => item.sourceId.startsWith("飞书链接同步:") && incomingRecordIds.has(recordIdFromSourceId(item.sourceId)))
    .map((item) => item.sourceId);
}

function findPlaceholderRows(existing) {
  return existing
    .filter((item) => {
      const recordId = recordIdFromSourceId(item.sourceId);
      return item.project === "未归属项目" && item.name === recordId && /^rec[a-zA-Z0-9]+$/.test(recordId);
    })
    .map((item) => item.sourceId);
}

function recordIdFromSourceId(sourceId) {
  return String(sourceId || "").split(":").pop() || "";
}

function mergeSyncedRequirements(existing, incoming) {
  const bySource = new Map(existing.map((item) => [item.sourceId, item]));

  return incoming.map((next) => {
    const current = bySource.get(next.sourceId);
    if (!current?.manualOverride) return next;

    return {
      ...next,
      priority: current.priority,
      status: current.status,
      estimateHours: current.estimateHours,
      sequence: current.sequence,
      isRush: current.isRush,
      rushReason: current.rushReason,
      startDate: current.startDate,
      dueDate: current.dueDate,
      autoScheduledDate: current.autoScheduledDate,
      blockedReason: current.blockedReason,
      note: current.note,
      createdAt: current.createdAt,
      manualOverride: true
    };
  });
}
