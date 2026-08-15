async function fetchFeishuWorkItems() {
  const sources = parseSources();
  if (sources.length === 0) return [];

  const token = await getTenantAccessToken();
  const batches = await Promise.all(sources.map((source) => fetchBitableSource(source, token)));
  return batches.flat();
}

function parseSources() {
  if (!process.env.FEISHU_SOURCES) return [];
  try {
    const parsed = JSON.parse(process.env.FEISHU_SOURCES);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`FEISHU_SOURCES is not valid JSON: ${error.message}`);
  }
}

async function getTenantAccessToken() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  });
  const payload = await response.json();

  if (!response.ok || payload.code !== 0) {
    throw new Error(`Failed to get tenant_access_token: ${payload.msg || response.statusText}`);
  }

  return payload.tenant_access_token;
}

async function fetchBitableSource(source, token) {
  const records = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (source.viewId) params.set("view_id", source.viewId);
    if (pageToken) params.set("page_token", pageToken);

    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${source.appToken}/tables/${source.tableId}/records?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      throw new Error(`Failed to fetch ${source.name || source.tableId}: ${payload.msg || response.statusText}`);
    }

    records.push(...(payload.data?.items || []));
    pageToken = payload.data?.page_token || "";
  } while (pageToken);

  return records.map((record) => mapBitableRecord(source, record));
}

function mapBitableRecord(source, record) {
  const fields = record.fields || {};
  const map = source.fieldMap || {};
  const get = (key, fallback = "") => readField(fields[map[key] || key], fallback);
  const title = get("title") || get("需求名称") || record.record_id;

  return {
    id: `${source.name || source.tableId}:${record.record_id}`,
    title,
    project: get("project") || source.name || "未归属项目",
    url: get("url") || buildRecordUrl(source, record.record_id),
    creator: get("creator") || get("productOwner") || "未填写",
    productOwner: get("productOwner") || get("creator"),
    assignee: get("assignee"),
    designOwner: get("designOwner") || get("owner"),
    priority: get("priority") || "P2",
    status: get("status") || "待设计",
    estimateHours: Number(get("estimateHours", 8)) || 8,
    dueDate: normalizeDate(get("dueDate")),
    createdAt: normalizeDateTime(get("createdAt")) || new Date().toISOString(),
    labels: splitLabels(get("labels")),
    type: get("type") || "UI",
    sequence: Number(get("sequence", 999)) || 999,
    isRush: isTruthy(get("isRush")),
    rushReason: get("rushReason"),
    originalStartDate: normalizeDate(get("originalStartDate")),
    originalEndDate: normalizeDate(get("originalEndDate"))
  };
}

function readField(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) {
    return value.map((item) => readField(item)).filter(Boolean).join("、");
  }
  if (typeof value === "object") {
    return value.name || value.text || value.en_name || value.email || value.id || JSON.stringify(value);
  }
  return String(value);
}

function normalizeDate(value) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const timestamp = Number(value);
  if (!Number.isNaN(timestamp) && timestamp > 0) {
    return new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function normalizeDateTime(value) {
  const date = normalizeDate(value);
  return date ? `${date}T00:00:00.000Z` : undefined;
}

function splitLabels(value) {
  if (!value) return [];
  return String(value).split(/[、,，\s]+/).filter(Boolean);
}

function isTruthy(value) {
  return ["true", "1", "是", "插单", "yes"].includes(String(value || "").toLowerCase());
}

function buildRecordUrl(source, recordId) {
  if (!source.appToken) return "";
  const base = `https://www.feishu.cn/base/${source.appToken}`;
  const table = source.tableId ? `?table=${source.tableId}` : "";
  return `${base}${table}#${recordId}`;
}

module.exports = { fetchFeishuWorkItems };
