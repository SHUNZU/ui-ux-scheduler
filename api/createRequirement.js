const { scheduleRequirements } = require("./_lib/scheduler");
const { hasEditAccess } = require("./_lib/auth");
const { fromDbRow, listRequirements, upsertRequirements } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasEditAccess(req)) {
    return res.status(401).json({ error: "Edit access required" });
  }

  try {
    const body = await readJson(req);
    const now = new Date().toISOString();
    const sourceId = body.sourceId || `MANUAL-${Date.now()}`;
    const requirement = {
      id: sourceId,
      sourceId,
      name: body.name || "新需求",
      project: body.project || "未归属项目",
      sourceUrl: body.sourceUrl || "",
      requester: body.requester || "",
      productOwner: body.productOwner || "",
      owner: body.owner || "",
      priority: body.priority || "P2",
      status: body.status || "待设计",
      estimateHours: Number(body.estimateHours || 8),
      sequence: Number(body.sequence || 999),
      isRush: Boolean(body.isRush),
      rushReason: body.rushReason || "",
      startDate: body.startDate || undefined,
      dueDate: body.dueDate || undefined,
      syncedAt: now,
      blockedReason: "",
      note: body.note || "",
      createdAt: now,
      manualOverride: true
    };

    await upsertRequirements([requirement]);
    const rows = await listRequirements();
    const requirements = rows.map(fromDbRow);

    return res.status(200).json({
      created: requirement,
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
