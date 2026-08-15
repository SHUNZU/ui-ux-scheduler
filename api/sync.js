const { fetchFeishuWorkItems } = require("./_lib/feishu");
const { isDesignWorkItem, normalizeWorkItem } = require("./_lib/normalize");
const { scheduleRequirements } = require("./_lib/scheduler");
const { fromDbRow, listRequirements, upsertRequirements } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.SYNC_SECRET && req.headers.authorization !== `Bearer ${process.env.SYNC_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const syncedAt = new Date().toISOString();
    const items = await fetchFeishuWorkItems();
    const designItems = items.filter(isDesignWorkItem);
    const normalized = designItems.map((item) => normalizeWorkItem(item, syncedAt));

    await upsertRequirements(normalized);
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
