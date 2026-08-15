# 线上部署检查清单

## 1. Supabase

1. 新建 Supabase project。
2. 打开 SQL Editor。
3. 执行 `database/schema.sql`。
4. 在 Project Settings > API 中复制：
   - Project URL -> `SUPABASE_URL`
   - service_role secret -> `SUPABASE_SERVICE_ROLE_KEY`

## 2. 飞书开放平台

1. 创建企业自建应用。
2. 获取：
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
3. 给应用开多维表格读取权限。
4. 把应用添加到需要同步的多维表格权限中。

## 3. FEISHU_SOURCES

`FEISHU_SOURCES` 是一个 JSON 数组。示例：

```json
[
  {
    "name": "项目A",
    "appToken": "base_app_token",
    "tableId": "tblxxxx",
    "viewId": "vewxxxx",
    "fieldMap": {
      "title": "需求名称",
      "project": "所属项目",
      "url": "需求链接",
      "creator": "需求提出人",
      "productOwner": "产品负责人",
      "designOwner": "设计负责人",
      "priority": "优先级",
      "status": "状态",
      "estimateHours": "预估工时",
      "dueDate": "期望完成时间",
      "labels": "标签",
      "type": "需求类型",
      "sequence": "排期顺序",
      "isRush": "是否插单",
      "rushReason": "插单原因"
    }
  }
]
```

## 4. Vercel

1. 把项目推到 GitHub。
2. 在 Vercel 导入仓库。
3. 配置环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `FEISHU_SOURCES`
4. 先不要配置 `SYNC_SECRET`，等链路跑通后再加。
5. 部署。

## 5. 验证

打开：

```text
https://你的域名/api/health
```

期望看到：

```json
{
  "ok": true,
  "supabase": true,
  "feishu": true,
  "sources": 1
}
```

如果暂时没有飞书表格配置，可以先导入 demo 数据：

```text
https://你的域名/api/seedDemo
```

如果飞书配置好了，执行首次同步：

```text
https://你的域名/api/sync
```

然后打开首页：

```text
https://你的域名
```

## 6. 常见问题

- `supabase: false`：Vercel 环境变量没有配置 Supabase。
- `feishu: false`：缺少飞书 `app_id` 或 `app_secret`。
- `sources: -1`：`FEISHU_SOURCES` 不是合法 JSON。
- 页面还是 demo 数据：Supabase 为空，先访问 `/api/seedDemo` 或 `/api/sync`。
