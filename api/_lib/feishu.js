async function fetchFeishuWorkItems(options = {}) {
  const sources = options.sourceUrl ? [parseSourceUrl(options.sourceUrl)] : parseSources();
  if (sources.length === 0) return [];

  const token = await getTenantAccessToken();
  const batches = await Promise.all(sources.map((source) => fetchBitableSource(source, token)));
  return batches.flat();
}

function parseSourceUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("飞书表格链接格式不正确");
  }

  const appToken = url.pathname.split("/").filter(Boolean).pop();
  const tableId = url.searchParams.get("table") || "";
  const viewId = url.searchParams.get("view") || "";
  const recordId = findRecordId(url);

  if (!appToken || !tableId) {
    throw new Error("飞书表格链接缺少 appToken 或 table 参数");
  }

  return {
    name: `飞书:${appToken}:${tableId}`,
    appToken,
    tableId,
    viewId,
    recordId,
    useView: Boolean(viewId)
  };
}

function findRecordId(url) {
  for (const [, value] of url.searchParams.entries()) {
    const match = String(value).match(/rec[a-zA-Z0-9]+/);
    if (match) return match[0];
  }

  const hashMatch = decodeURIComponent(url.hash || "").match(/rec[a-zA-Z0-9]+/);
  return hashMatch ? hashMatch[0] : "";
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
  const tables = source.includeAllTables ? await fetchBitableTables(source, token) : [source];
  const batches = [];

  for (const table of tables) {
    const tableSource = {
      ...source,
      originalTableId: source.tableId,
      tableId: table.tableId || source.tableId,
      tableName: table.tableName || source.tableName
    };
    batches.push(...await fetchBitableTableRecords(tableSource, token));
  }

  return batches;
}

async function fetchBitableTables(source, token) {
  const tables = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams();
    if (pageToken) params.set("page_token", pageToken);

    const query = params.toString();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${source.appToken}/tables${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      if (source.tableId) return [source];
      throw new Error(`Failed to list tables for ${source.name || source.appToken}: ${payload.msg || response.statusText}`);
    }

    const items = payload.data?.items || [];
    tables.push(...items.map((item) => ({
      tableId: item.table_id,
      tableName: item.name
    })).filter((item) => item.tableId));
    pageToken = payload.data?.page_token || payload.data?.next_page_token || "";
  } while (pageToken);

  if (tables.length === 0 && source.tableId) {
    return [source];
  }

  return tables;
}

async function fetchBitableTableRecords(source, token) {
  const fieldIndex = await fetchBitableFieldIndex(source, token);

  if (source.recordId) {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${source.appToken}/tables/${source.tableId}/records/${source.recordId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      throw new Error(`Failed to fetch record ${source.recordId}: ${payload.msg || response.statusText}`);
    }

    return [mapBitableRecord(source, payload.data?.record || payload.data, fieldIndex)];
  }

  const records = [];
  let pageToken = "";
  let hasMore = true;

  do {
    const params = new URLSearchParams({ page_size: String(source.pageSize || 500) });
    if (source.viewId && source.useView !== false) params.set("view_id", source.viewId);
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
    pageToken = payload.data?.page_token || payload.data?.next_page_token || "";
    hasMore = Boolean(payload.data?.has_more || pageToken);
  } while (hasMore && pageToken);

  return records.map((record) => mapBitableRecord(source, record, fieldIndex));
}

async function fetchBitableFieldIndex(source, token) {
  const fields = [];
  let pageToken = "";
  let hasMore = true;
  const seenTokens = new Set();

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);

    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${source.appToken}/tables/${source.tableId}/fields?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      return new Map();
    }

    fields.push(...(payload.data?.items || []));
    const nextPageToken = payload.data?.page_token || payload.data?.next_page_token || "";
    hasMore = Boolean(payload.data?.has_more && nextPageToken && !seenTokens.has(nextPageToken));
    if (nextPageToken) seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (hasMore && seenTokens.size < 20);

  const index = new Map();
  for (const field of fields) {
    const names = [field.field_name, field.name, field.field_id].filter(Boolean);
    for (const name of names) {
      index.set(normalizeFieldKey(name), field.field_id || field.name || field.field_name);
    }
  }
  return index;
}

function mapBitableRecord(source, record, fieldIndex = new Map()) {
  const fields = record.fields || {};
  const map = source.fieldMap || {};
  const get = (key, fallback = "", aliases = []) => {
    const candidates = resolveFieldCandidates(fields, fieldIndex, [map[key], key, ...aliases].filter(Boolean));
    for (const candidate of candidates) {
      const value = readField(fields[candidate]);
      if (value) return value;
    }
    return fallback;
  };
  const title = get("title", "", ["需求", "需求名称", "需求名", "名称", "标题"]) || record.record_id;
  const project = get("project", "", ["项目", "项目名称", "项目标签", "所属项目", "所属项目标签"]) || "未归属项目";
  const productOwner = get("productOwner", "", ["产品人员", "产品负责人", "产品", "需求负责人"]);
  const designOwner = get("designOwner", "", ["设计人员", "设计负责人", "当前负责人", "负责人", "owner"]);
  const startDate = normalizeDate(get("startDate", "", ["开始时间", "开始日期", "排期开始"]));
  const dueDate = normalizeDate(get("dueDate", "", ["截止时间", "截止日期", "结束时间", "结束日期", "排期结束"]));

  return {
    id: buildSourceId(source, record.record_id),
    title,
    project,
    url: get("url", "", ["需求链接", "链接"]) || buildRecordUrl(source, record.record_id),
    creator: get("creator", productOwner || "未填写", ["提出人", "创建人", "产品负责人"]),
    productOwner: productOwner || get("creator", "", ["提出人", "创建人"]),
    assignee: designOwner,
    designOwner,
    priority: get("priority", "P2", ["优先级"]),
    status: get("status", "待设计", ["状态"]),
    estimateHours: Number(get("estimateHours", 8, ["预估工时", "工时", "设计工时"])) || 8,
    startDate,
    dueDate,
    createdAt: normalizeDateTime(get("createdAt", "", ["创建时间", "创建日期"])) || new Date().toISOString(),
    labels: splitLabels(get("labels", "", ["标签"])),
    type: get("type", "UI", ["类型", "需求类型"]) || "UI",
    sequence: Number(get("sequence", 999, ["排序", "顺序"])) || 999,
    isRush: isTruthy(get("isRush", "", ["是否插单", "插单"])),
    rushReason: get("rushReason", "", ["插单原因"]),
    originalStartDate: normalizeDate(get("originalStartDate", "", ["原排期开始"])) || startDate,
    originalEndDate: normalizeDate(get("originalEndDate", "", ["原排期结束"])) || dueDate
  };
}

function resolveFieldCandidates(fields, fieldIndex, names) {
  const keys = Object.keys(fields);
  const candidates = [];

  for (const name of names) {
    const normalized = normalizeFieldKey(name);
    const mapped = fieldIndex.get(normalized);
    if (mapped) candidates.push(mapped);
    candidates.push(name);
    const direct = keys.find((key) => normalizeFieldKey(key) === normalized);
    if (direct) candidates.push(direct);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function normalizeFieldKey(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function buildSourceId(source, recordId) {
  if (!source.includeAllTables || source.tableId === source.originalTableId) {
    return `${source.name || source.tableId}:${recordId}`;
  }
  return `${source.name || source.appToken}:${source.tableId}:${recordId}`;
}

function readField(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) {
    return value.map((item) => readField(item)).filter(Boolean).join("、");
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "value")) return readField(value.value, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "text")) return readField(value.text, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "name")) return readField(value.name, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "en_name")) return readField(value.en_name, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "link")) return readField(value.text || value.link, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "email")) return readField(value.email, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "title")) return readField(value.title, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "url")) return readField(value.url, fallback);
    return fallback;
  }
  return String(value);
}

function normalizeDate(value) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const timestamp = Number(value);
  if (!Number.isNaN(timestamp) && timestamp > 0) {
    return formatDateInTimeZone(new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000), "Asia/Shanghai");
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : formatDateInTimeZone(parsed, "Asia/Shanghai");
}

function formatDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
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
