const { scheduleRequirements } = require("./_lib/scheduler");
const { deleteRequirement, fromDbRow, listRequirements } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasEditAccess(req)) {
    return res.status(401).json({ error: "Edit access required" });
  }

  try {
    const sourceId = req.query?.sourceId || new URL(req.url, "https://local").searchParams.get("sourceId");
    if (!sourceId) return res.status(400).json({ error: "sourceId is required" });

    await deleteRequirement(sourceId);
    const rows = await listRequirements();
    const requirements = rows.map(fromDbRow);
    return res.status(200).json({ requirements, scheduled: scheduleRequirements(requirements) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function hasEditAccess(req) {
  const editKey = process.env.EDIT_KEY || process.env.SYNC_SECRET;
  if (!editKey) return false;
  return req.headers.authorization === `Bearer ${editKey}`;
}
