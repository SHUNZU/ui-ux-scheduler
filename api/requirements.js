const { scheduleRequirements } = require("./_lib/scheduler");
const { fromDbRow, hasSupabaseConfig, listRequirements } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasSupabaseConfig()) {
    return res.status(200).json({
      requirements: [],
      scheduled: [],
      source: "empty",
      message: "Supabase is not configured. The frontend will use local demo data."
    });
  }

  try {
    const rows = await listRequirements();
    const requirements = rows.map(fromDbRow);
    return res.status(200).json({
      requirements,
      scheduled: scheduleRequirements(requirements),
      source: "supabase",
      syncedAt: latestSyncTime(requirements)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function latestSyncTime(requirements) {
  return requirements
    .map((item) => item.syncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}
