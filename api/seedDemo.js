const { normalizeWorkItem } = require("./_lib/normalize");
const { scheduleRequirements } = require("./_lib/scheduler");
const { fromDbRow, listRequirements, upsertRequirements } = require("./_lib/supabase");

const demoItems = [
  {
    id: "DEMO-1001",
    title: "会员中心改版交互与视觉设计",
    project: "会员增长",
    url: "https://example.feishu.cn/project/DEMO-1001",
    creator: "产品-林乔",
    productOwner: "林乔",
    assignee: "周然",
    priority: "P1",
    status: "设计中",
    estimateHours: 14,
    dueDate: "2026-08-18",
    createdAt: "2026-08-11T09:30:00.000Z",
    labels: ["UI", "UX"],
    type: "UX",
    sequence: 2
  },
  {
    id: "DEMO-1002",
    title: "线上投诉入口临时改版",
    project: "线上风险处理",
    url: "https://example.feishu.cn/project/DEMO-1002",
    creator: "项目-沈宁",
    productOwner: "沈宁",
    assignee: "周然",
    priority: "P0",
    status: "待设计",
    estimateHours: 12,
    dueDate: "2026-08-17",
    createdAt: "2026-08-13T02:10:00.000Z",
    labels: ["UI", "插单"],
    type: "视觉设计",
    sequence: 0,
    isRush: true,
    rushReason: "线上投诉量上升，需要优先处理入口说明与页面路径"
  },
  {
    id: "DEMO-1003",
    title: "订单详情页空状态补齐",
    project: "交易体验",
    url: "https://example.feishu.cn/project/DEMO-1003",
    creator: "产品-陈嘉",
    productOwner: "陈嘉",
    assignee: "李安",
    priority: "P2",
    status: "待设计",
    estimateHours: 5,
    dueDate: "2026-08-20",
    createdAt: "2026-08-12T03:20:00.000Z",
    labels: ["UI"],
    type: "视觉",
    sequence: 3
  }
];

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
    const normalized = demoItems.map((item) => normalizeWorkItem(item, syncedAt));
    await upsertRequirements(normalized);

    const rows = await listRequirements();
    const requirements = rows.map(fromDbRow);

    return res.status(200).json({
      seeded: normalized.length,
      requirements,
      scheduled: scheduleRequirements(requirements)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
