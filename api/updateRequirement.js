const { scheduleRequirements } = require("./_lib/scheduler");
const { listRequirements, updateRequirement } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await readJson(req);
    if (!body.sourceId) {
      return res.status(400).json({ error: "sourceId is required" });
    }

    const updated = await updateRequirement(body.sourceId, {
      ...body.patch,
      manualOverride: true
    });
    const rows = await listRequirements();
    const requirements = rows.map(require("./_lib/supabase").fromDbRow);

    return res.status(200).json({
      updated,
      requirements,
      scheduled: scheduleRequirements(requirements)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
