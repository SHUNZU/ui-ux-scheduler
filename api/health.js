const { hasSupabaseConfig } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    ok: true,
    supabase: hasSupabaseConfig(),
    feishu: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    sources: parseSourcesCount(),
    syncProtected: Boolean(process.env.SYNC_SECRET)
  });
};

function parseSourcesCount() {
  if (!process.env.FEISHU_SOURCES) return 0;
  try {
    const sources = JSON.parse(process.env.FEISHU_SOURCES);
    return Array.isArray(sources) ? sources.length : 0;
  } catch {
    return -1;
  }
}
