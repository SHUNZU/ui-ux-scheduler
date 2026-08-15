import express from "express";

const app = express();

app.get("/api/feishu/design-work-items", async (_req, res) => {
  // Keep app secret and tenant token logic on the server.
  // 1. Read FEISHU_APP_ID and FEISHU_APP_SECRET from environment variables.
  // 2. Exchange them for tenant_access_token.
  // 3. Call Feishu Project/Task work item APIs.
  // 4. Map the response to the ProjectWorkItem shape used by src/services/projectSync.ts.
  res.json({ items: [] });
});

app.listen(process.env.PORT ?? 8787);
