async function fetchFeishuWorkItems(options = {}) {
  const sources = options.sourceUrl ? [parseSourceUrl(options.sourceUrl)] : parseSources();
  if (sources.length === 0) return [];

  const bitableSources = sources.filter((source) => source.kind !== "project");
  const projectSources = sources.filter((source) => source.kind === "project");
  const bitableToken = bitableSources.length > 0 ? await getTenantAccessToken() : "";
  const batches = await Promise.all([
    ...bitableSources.map((source) => fetchBitableSource(source, bitableToken)),
    ...projectSources.map((source) => fetchProjectSource(source))
  ]);
  return batches.flat();
}

function parseSourceUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("飞书表格链接格式不正确");
  }

  if (url.hostname === "project.feishu.cn") {
    return parseProjectSourceUrl(url);
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

function parseProjectSourceUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const projectKey = parts[0] || "";
  const workItemTypeKey = parts[1] || "story";
  const workItemId = findProjectWorkItemId(url, parts);

  if (!projectKey) {
    throw new Error("飞书项目链接缺少项目空间 key");
  }

  return {
    kind: "project",
    name: `飞书项目:${projectKey}:${workItemTypeKey}`,
    projectKey,
    workItemTypeKey,
    workItemId
  };
}

function findProjectWorkItemId(url, parts) {
  const candidates = [
    url.searchParams.get("work_item_id"),
    url.searchParams.get("workItemId"),
    url.searchParams.get("id"),
    ...parts
  ].filter(Boolean);
  const matched = candidates.find((value) => /^\d+$/.test(String(value)));
  return matched ? Number(matched) : 0;
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

async function fetchProjectSource(source) {
  if (!process.env.FEISHU_PROJECT_PLUGIN_TOKEN || !process.env.FEISHU_PROJECT_USER_KEY) {
    throw new Error("飞书项目同步缺少 FEISHU_PROJECT_PLUGIN_TOKEN 或 FEISHU_PROJECT_USER_KEY。飞书项目 OpenAPI 需要插件 token 和 user key。");
  }

  if (source.workItemId) {
    return fetchProjectWorkItemDetails(source, [source.workItemId]);
  }

  const records = [];
  let pageNum = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore && pageNum <= 50) {
    const payload = await requestProjectApi(source, `/work_item/filter`, {
      work_item_type_keys: [source.workItemTypeKey || "story"],
      page_num: pageNum,
      page_size: pageSize,
      expand: {
        need_workflow: true,
        relation_fields_detail: true,
        need_multi_text: true,
        need_user_detail: true,
        need_sub_task_parent: true
      }
    });
    const items = extractProjectItems(payload);
    records.push(...items);
    hasMore = items.length >= pageSize;
    pageNum += 1;
  }

  return records.map((record) => mapProjectWorkItem(source, record));
}

async function fetchProjectWorkItemDetails(source, workItemIds) {
  const payload = await requestProjectApi(source, `/work_item/${source.workItemTypeKey || "story"}/query`, {
    work_item_ids: workItemIds,
    expand: {
      need_workflow: true,
      relation_fields_detail: true,
      need_multi_text: true,
      need_user_detail: true,
      need_sub_task_parent: true
    }
  });
  return extractProjectItems(payload).map((record) => mapProjectWorkItem(source, record));
}

async function requestProjectApi(source, path, body) {
  const url = `https://project.feishu.cn/open_api/${source.projectKey}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PLUGIN-TOKEN": process.env.FEISHU_PROJECT_PLUGIN_TOKEN,
      "X-USER-KEY": process.env.FEISHU_PROJECT_USER_KEY
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !isProjectApiSuccess(payload)) {
    throw new Error(`Failed to fetch 飞书项目 ${source.projectKey}: ${projectApiErrorMessage(payload, response.statusText)}`);
  }

  return payload;
}

function isProjectApiSuccess(payload) {
  const code = payload.err_code ?? payload.code ?? payload.error_code ?? 0;
  return Number(code) === 0;
}

function projectApiErrorMessage(payload, fallback) {
  if (payload.err?.msg) return payload.err.msg;
  if (payload.err_msg) return payload.err_msg;
  if (payload.msg) return payload.msg;
  if (payload.message) return payload.message;
  return fallback;
}

function extractProjectItems(payload) {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.data?.list)) return payload.data.list;
  if (Array.isArray(payload.result)) return payload.result;
  return [];
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

function mapProjectWorkItem(source, record) {
  const fieldMap = buildProjectFieldMap(record.fields);
  const get = (aliases, fallback = "") => {
    for (const alias of aliases) {
      const value = fieldMap.get(normalizeFieldKey(alias));
      const readable = readField(value);
      if (readable) return readable;
    }
    return fallback;
  };
  const currentNodeName = readProjectNodeNames(record.current_nodes || record.current_node);
  const currentNodeOwners = readProjectNodeOwners(record.current_nodes || record.current_node);
  const statusName = readProjectStatus(record.work_item_status) || currentNodeName;
  const designOwner = get(["设计负责人", "设计人员", "当前负责人", "负责人", "owner", "role_owners"], currentNodeOwners);
  const productOwner = get(["产品负责人", "产品人员", "产品", "需求负责人", "PM", "pm"]);
  const projectName = get(["项目", "项目名称", "项目标签", "所属项目", "所属项目标签", "业务线", "business"], record.simple_name || source.projectKey);
  const startDate = normalizeDate(get(["开始时间", "开始日期", "计划开始时间", "排期开始", "start_time"]));
  const dueDate = normalizeDate(get(["截止时间", "截止日期", "结束时间", "结束日期", "计划完成时间", "排期结束", "end_time"]));
  const workItemId = record.id || record.work_item_id;

  return {
    id: buildProjectSourceId(source, workItemId),
    title: record.name || record.work_item_name || `需求 ${workItemId}`,
    project: projectName || "未归属项目",
    url: buildProjectWorkItemUrl(source, workItemId),
    creator: readField(record.created_by) || get(["提出人", "创建人", "下发人"], productOwner || "未填写"),
    productOwner: productOwner || get(["提出人", "创建人", "下发人"]),
    assignee: designOwner,
    designOwner,
    priority: get(["优先级", "priority"], readField(record.priority) || "P2"),
    status: get(["状态", "status"], statusName || "待设计"),
    estimateHours: Number(get(["预估工时", "工时", "设计工时", "预估", "estimate"], 8)) || 8,
    startDate,
    dueDate,
    createdAt: normalizeDateTime(record.created_at) || new Date().toISOString(),
    labels: splitLabels(get(["标签", "tags"], "UI")),
    type: get(["类型", "需求类型"], "UI") || "UI",
    sequence: Number(get(["排序", "顺序", "sequence"], 999)) || 999,
    isRush: isTruthy(get(["是否插单", "插单", "紧急插入"])),
    rushReason: get(["插单原因"]),
    originalStartDate: normalizeDate(get(["原排期开始"])) || startDate,
    originalEndDate: normalizeDate(get(["原排期结束"])) || dueDate
  };
}

function buildProjectFieldMap(fields) {
  const map = new Map();
  if (!fields) return map;

  if (Array.isArray(fields)) {
    for (const field of fields) {
      const keys = [
        field.field_name,
        field.name,
        field.label,
        field.field_alias,
        field.field_key,
        field.alias,
        field.key
      ].filter(Boolean);
      for (const key of keys) {
        map.set(normalizeFieldKey(key), field.field_value ?? field.value ?? field);
      }
    }
    return map;
  }

  for (const [key, value] of Object.entries(fields)) {
    map.set(normalizeFieldKey(key), value);
  }
  return map;
}

function readProjectStatus(status) {
  if (!status) return "";
  if (Array.isArray(status)) return status.map(readProjectStatus).filter(Boolean).join("、");
  if (typeof status === "object") {
    return readField(status.name || status.state_name || status.state_key || status.label || status.value);
  }
  return readField(status);
}

function readProjectNodeNames(nodes) {
  if (!Array.isArray(nodes)) return "";
  return nodes.map((node) => readField(node.name || node.state_name || node.state_key || node.id)).filter(Boolean).join("、");
}

function readProjectNodeOwners(nodes) {
  if (!Array.isArray(nodes)) return "";
  return nodes.flatMap((node) => Array.isArray(node.owners) ? node.owners : []).map(readField).filter(Boolean).join("、");
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

function buildProjectSourceId(source, workItemId) {
  return `${source.name}:${workItemId}`;
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

function buildProjectWorkItemUrl(source, workItemId) {
  const typeKey = source.workItemTypeKey || "story";
  if (!workItemId) return `https://project.feishu.cn/${source.projectKey}/${typeKey}/homepage`;
  return `https://project.feishu.cn/${source.projectKey}/${typeKey}/detail/${workItemId}`;
}

module.exports = { fetchFeishuWorkItems };
