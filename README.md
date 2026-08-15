# UI/UX 需求管理与自动排期系统

一个飞书多维表格风格的 UI/UX 需求管理系统。它可以汇总来自飞书项目或多维表格的设计需求，按负责人、插单、优先级、排期顺序和截止时间自动计算排期，并用甘特图、表格和插单影响视图展示给产品、项目和设计团队。

## 已实现能力

- 甘特图视图：按 UI 负责人分泳道展示需求排期。
- 表格视图：用类似多维表格的行列方式查看需求、项目、负责人、状态、优先级和来源。
- 插单影响视图：集中展示插单和被顺延的需求。
- 自动顺延：插单会优先进入队列，后续同负责人需求自动往后排。
- 延期说明：展示延期工作日和延期原因。
- 抽屉编辑：可调整负责人、状态、优先级、预估工时、排期顺序、插单原因等字段。

## 本地运行

```bash
npm install
npm run start
```

默认开发端口是 `5178`。接入飞书开放平台后，将 `app.json` 与 `block.json` 中的占位 ID 替换为企业自建应用的 `App ID` 和多维表格数据表视图 `BlockTypeID`。

## 线上部署

推荐免费 MVP 组合：

```text
Vercel：部署前端和 API
Supabase：保存需求和排期数据
飞书开放平台：读取多维表格
```

完整步骤见 `DEPLOYMENT.md`。

### 1. 创建 Supabase 数据表

在 Supabase 项目的 SQL Editor 中执行：

```sql
-- 复制 database/schema.sql 的全部内容执行
```

### 2. 配置 Vercel 环境变量

参考 `.env.example`，在 Vercel Project Settings > Environment Variables 中添加：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_SOURCES
```

如果希望同步接口不被外部随意调用，再添加：

```text
SYNC_SECRET
VITE_SYNC_SECRET
```

注意：启用 `SYNC_SECRET` 后，Vercel Cron 需要能携带同样的鉴权头；如果只是先跑 MVP，可以先不设置 `SYNC_SECRET`，等内测稳定后再加鉴权。

### 3. 部署

把项目推到 GitHub 后，在 Vercel 导入仓库即可。Vercel 会执行：

```bash
npm run vercel-build
```

生成的静态页面在 `dist`，服务端接口在 `api`。

### 4. 首次同步

部署完成后访问：

```text
https://你的域名/api/sync
```

成功后，再打开线上首页：

```text
https://你的域名
```

页面会从 `/api/requirements` 读取 Supabase 中的最新排期。`vercel.json` 里已经配置了每 15 分钟访问一次 `/api/sync`。

## 接入真实飞书数据

前端不会保存飞书应用密钥。生产环境应部署 `server/feishu-sync.example.ts` 里的服务端同步接口，由服务端调用飞书项目/任务或多维表格 OpenAPI，再把标准化后的需求列表返回给前端。

推荐数据流：

```text
项目飞书表格 / 飞书项目
        ↓
服务端同步接口
        ↓
UI/UX 需求管理系统
        ↓
自动排期与甘特图展示
```

如果没有配置 Supabase，前端会自动回退到本地 demo 数据；配置好 Supabase 后，所有人打开线上链接看到的是同一份云端数据。

需要的多维表格字段：

- 需求名称
- 所属项目
- 需求来源 ID
- 需求链接
- 需求下发人
- 设计负责人
- 优先级
- 状态
- 预计设计工时
- 排期顺序
- 是否插单
- 插单原因
- 开始日期
- 截止日期
- 原排期开始
- 原排期结束
- 自动排期日期
- 延期工作日
- 延期原因
- 同步时间
- 阻塞原因
- 备注

## 排期规则

系统按负责人单独排队，每人默认每日 8 小时产能，周末不排期。排序优先级为：

```text
未完成需求 > 插单需求 > 排期顺序 > 优先级 > 截止时间 > 创建时间
```

当插单进入队列后，同负责人后续需求会自动顺延，并计算延期工作日。

## 验证

```bash
npm run typecheck
npm run test
npm run build
```
