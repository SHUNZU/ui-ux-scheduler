const { fetchFeishuWorkItems } = require("./_lib/feishu");
const { hasEditAccess } = require("./_lib/auth");
const { isDesignWorkItem, normalizeWorkItem } = require("./_lib/normalize");
const { scheduleRequirements } = require("./_lib/scheduler");
const { fromDbRow, listRequirements, upsertRequirements } = require("./_lib/supabase");

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
    const items = await fetchFeishuWorkItems();
    const designItems = items.filter(isDesignWorkItem);
    const normalized = designItems.map((item) => normalizeWorkItem(item, syncedAt));
    const existingRows = await listRequirements();
    const existing = existingRows.map(fromDbRow);
    const merged = mergeSyncedRequirements(existing, normalized);

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

function mergeSyncedRequirements(existing, incoming) {
  const bySource = new Map(existing.map((item) => [item.sourceId, item]));

  return incoming.map((next) => {
    const current = bySource.get(next.sourceId);
    if (!current?.manualOverride) return next;

    return {
      ...next,
      name: current.name,
      project: current.project,
      requester: current.requester,
      productOwner: current.productOwner,
      owner: current.owner,
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
