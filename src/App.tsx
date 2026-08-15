import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { GanttBoard } from "./components/GanttBoard";
import { RequirementDrawer } from "./components/RequirementDrawer";
import { RequirementTable } from "./components/RequirementTable";
import { SummaryRail } from "./components/SummaryRail";
import { Toolbar } from "./components/Toolbar";
import { ViewTabs } from "./components/ViewTabs";
import { scheduleRequirements, summarizeOwnerLoads } from "./lib/scheduler";
import { todayIso, toIsoDate } from "./lib/date";
import { UNASSIGNED_OWNER } from "./lib/constants";
import { upsertRequirementsToBitable } from "./services/bitable";
import { createManualRequirement, deleteCloudRequirement, saveRequirementPatch, syncProjectRequirements, triggerProjectSync } from "./services/projectSync";
import { DesignRequirement, Filters, ScheduledRequirement } from "./types";
import "./styles/app.css";

const initialFilters: Filters = {
  requester: "",
  owner: "",
  status: "",
  priority: "",
  startDate: todayIso(),
  endDate: toIsoDate(addDays(new Date(), 14)),
  overloadedOnly: false,
  blockedOnly: false,
  rushOnly: false,
  delayedOnly: false
};

export default function App() {
  const [requirements, setRequirements] = useState<DesignRequirement[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selected, setSelected] = useState<ScheduledRequirement | null>(null);
  const [syncLabel, setSyncLabel] = useState("等待首次同步");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scheduleSeed, setScheduleSeed] = useState(todayIso());
  const [activeTab, setActiveTab] = useState("gantt");
  const [ganttScale, setGanttScale] = useState<"week" | "month" | "quarter">("week");
  const editKey = useMemo(() => new URLSearchParams(window.location.search).get("edit_key")?.trim() ?? "", []);
  const canEdit = editKey.length > 0;

  useEffect(() => {
    void handleLoad();
  }, []);

  const scheduled = useMemo(() => scheduleRequirements(requirements, scheduleSeed), [requirements, scheduleSeed]);
  const filtered = useMemo(() => {
    return scheduled.filter((item) => {
      if (filters.requester && item.requester !== filters.requester) return false;
      if (filters.owner && item.ownerLane !== filters.owner) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.priority && item.priority !== filters.priority) return false;
      if (filters.startDate && item.scheduledEnd < filters.startDate) return false;
      if (filters.endDate && item.scheduledStart > filters.endDate) return false;
      if (filters.overloadedOnly && !item.overCapacity) return false;
      if (filters.blockedOnly && item.status !== "阻塞") return false;
      if (filters.rushOnly && !item.isRush) return false;
      if (filters.delayedOnly && item.delayedDays <= 0) return false;
      return true;
    });
  }, [scheduled, filters]);

  const owners = useMemo(() => unique(scheduled.map((item) => item.ownerLane)), [scheduled]);
  const visibleOwners = useMemo(() => unique(filtered.map((item) => item.ownerLane)), [filtered]);
  const requesters = useMemo(() => unique(scheduled.map((item) => item.requester)), [scheduled]);
  const productOwners = useMemo(() => unique(scheduled.map((item) => item.productOwner || item.requester)), [scheduled]);
  const loads = useMemo(() => summarizeOwnerLoads(filtered), [filtered]);
  const tableNames = useMemo(() => {
    const firstSequenceByProject = new Map<string, number>();
    for (const item of scheduled) {
      const project = item.project || "需求表格";
      firstSequenceByProject.set(project, Math.min(firstSequenceByProject.get(project) ?? Number.MAX_SAFE_INTEGER, item.sequence));
    }
    const names = [...firstSequenceByProject.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "zh-CN"))
      .map(([name]) => name);
    return names.length > 0 ? names : ["需求表格"];
  }, [scheduled]);
  const activeTableRequirements = useMemo(
    () => filtered.filter((item) => (item.project || "需求表格") === activeTab),
    [filtered, activeTab]
  );

  async function handleLoad() {
    setLoading(true);
    setError("");
    try {
      const result = await syncProjectRequirements();
      setRequirements((current) => mergeRequirements(current, result.requirements));
      setSyncLabel(`已加载 ${result.requirements.length} 条设计需求`);
      await upsertRequirementsToBitable(result.requirements);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "需求加载失败");
      setSyncLabel("加载失败，已保留上次数据");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    if (!canEdit) return;
    setLoading(true);
    setError("");
    try {
      const result = await triggerProjectSync(editKey);
      setRequirements(result.requirements);
      setSyncLabel(`已从飞书同步 ${result.requirements.length} 条设计需求，忽略 ${result.ignoredCount} 条非设计需求`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "飞书项目同步失败");
      await handleLoad();
    } finally {
      setLoading(false);
    }
  }

  function handleUpdateRequirement(updated: ScheduledRequirement) {
    if (!canEdit) return;
    const patch: Partial<DesignRequirement> = {
      name: updated.name,
      owner: updated.owner,
      productOwner: updated.productOwner,
      requester: updated.requester,
      status: updated.status,
      priority: updated.priority,
      estimateHours: updated.estimateHours,
      startDate: updated.startDate,
      dueDate: updated.dueDate,
      sequence: updated.sequence,
      isRush: updated.isRush,
      rushReason: updated.rushReason,
      blockedReason: updated.blockedReason,
      note: updated.note,
      manualOverride: true
    };

    setRequirements((current) =>
      current.map((item) =>
        item.sourceId === updated.sourceId
          ? {
              ...item,
              ...patch
            }
          : item
      )
    );
    setSelected(updated);
    void saveRequirementPatch(updated.sourceId, patch, editKey).then((cloudRequirements) => {
      if (cloudRequirements) {
        setRequirements(cloudRequirements);
        setSyncLabel("已保存到云端排期");
      } else {
        setError("保存失败：当前链接没有编辑权限或编辑密钥不正确");
      }
    });
  }

  function handleReorderRequirements(reorderedVisible: ScheduledRequirement[]) {
    if (!canEdit) return;

    const visibleIds = new Set(reorderedVisible.map((item) => item.sourceId));
    const visibleQueue = [...reorderedVisible];
    const fullOrder = scheduled
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt))
      .map((item) => (visibleIds.has(item.sourceId) ? visibleQueue.shift() ?? item : item))
      .map((item, index) => ({ ...item, sequence: index + 1, manualOverride: true }));

    const patches = fullOrder
      .filter((item) => requirements.some((requirement) => requirement.sourceId === item.sourceId && requirement.sequence !== item.sequence))
      .map((item) => ({ sourceId: item.sourceId, sequence: item.sequence }));

    if (patches.length === 0) return;

    setRequirements((current) =>
      current.map((item) => {
        const reordered = fullOrder.find((next) => next.sourceId === item.sourceId);
        return reordered ? { ...item, sequence: reordered.sequence, manualOverride: true } : item;
      })
    );
    setSyncLabel(`已调整 ${patches.length} 条需求排序，正在保存`);

    void Promise.all(
      patches.map((patch) => saveRequirementPatch(patch.sourceId, { sequence: patch.sequence, manualOverride: true }, editKey))
    ).then((results) => {
      const latest = [...results].reverse().find(Boolean);
      if (latest) {
        setRequirements(latest);
        setSyncLabel("已保存拖动排序");
      }
    }).catch(() => {
      setError("排序保存失败，请刷新后重试");
    });
  }

  async function handleAddTable() {
    if (!canEdit) return;
    const projectName = window.prompt("请输入需求表格名称", `需求表格 ${tableNames.length + 1}`)?.trim();
    if (!projectName) return;
    await handleAddRequirement(projectName);
    setActiveTab(projectName);
  }

  async function handleAddRequirement(project: string, sequence?: number) {
    if (!canEdit) return;
    const maxSequence = requirements.reduce((max, item) => Math.max(max, item.sequence), 0);
    const createdAt = new Date().toISOString();
    const sourceId = `MANUAL-${Date.now()}`;
    const next = {
      id: sourceId,
      sourceId,
      name: "新需求",
      project,
      sourceUrl: "",
      requester: "",
      productOwner: "",
      owner: "",
      priority: "P2" as const,
      status: "待设计" as const,
      estimateHours: 8,
      sequence: sequence ?? maxSequence + 1,
      isRush: false,
      createdAt,
      syncedAt: createdAt,
      manualOverride: true
    };

    setRequirements((current) => [...current, next]);
    setSyncLabel(`已新增 ${project} / 新需求，正在保存`);

    const cloudRequirements = await createManualRequirement(next, editKey);
    if (cloudRequirements) {
      setRequirements(cloudRequirements);
      setSyncLabel("已保存新增需求");
    } else {
      setError("新增需求失败：当前链接没有编辑权限或编辑密钥不正确");
    }
  }

  function handleRenameProject(fromProject: string, toProject: string) {
    if (!canEdit || !fromProject || !toProject || fromProject === toProject) return;
    const affected = requirements.filter((item) => item.project === fromProject);
    if (affected.length === 0) return;

    setRequirements((current) =>
      current.map((item) => (item.project === fromProject ? { ...item, project: toProject, manualOverride: true } : item))
    );
    setActiveTab(toProject);
    setSyncLabel(`已将 ${fromProject} 改名为 ${toProject}，正在保存`);

    void Promise.all(
      affected.map((item) => saveRequirementPatch(item.sourceId, { project: toProject, manualOverride: true }, editKey))
    ).then((results) => {
      const latest = [...results].reverse().find(Boolean);
      if (latest) {
        setRequirements(latest);
        setSyncLabel("已保存项目表名称");
      }
    }).catch(() => {
      setError("项目表改名保存失败，请刷新后重试");
    });
  }

  function handleReorderTables(nextNames: string[]) {
    if (!canEdit) return;
    const orderedRows = nextNames.flatMap((name) =>
      requirements
        .filter((item) => (item.project || "需求表格") === name)
        .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt))
    );
    const patches = orderedRows.map((item, index) => ({ sourceId: item.sourceId, sequence: index + 1 }));
    setRequirements((current) =>
      current.map((item) => {
        const patch = patches.find((next) => next.sourceId === item.sourceId);
        return patch ? { ...item, sequence: patch.sequence, manualOverride: true } : item;
      })
    );
    void Promise.all(patches.map((patch) => saveRequirementPatch(patch.sourceId, { sequence: patch.sequence, manualOverride: true }, editKey)))
      .then((results) => {
        const latest = [...results].reverse().find(Boolean);
        if (latest) setRequirements(latest);
        setSyncLabel("已保存表格顺序");
      });
  }

  async function handleInsertRow(target: ScheduledRequirement, position: "above" | "below") {
    const ordered = requirements.slice().sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
    const targetIndex = ordered.findIndex((item) => item.sourceId === target.sourceId);
    const nextSequence = position === "above" ? Math.max(1, target.sequence - 1) : target.sequence + 1;
    await handleAddRequirement(target.project || activeTab, nextSequence);
    if (targetIndex >= 0) {
      setSyncLabel(position === "above" ? "已向上插入新需求" : "已向下插入新需求");
    }
  }

  function handleShareRow(requirement: ScheduledRequirement) {
    const url = `${window.location.origin}${window.location.pathname}?requirement=${encodeURIComponent(requirement.sourceId)}`;
    void navigator.clipboard?.writeText(url);
    setSyncLabel("已复制该需求分享链接");
  }

  async function handleDeleteRow(requirement: ScheduledRequirement) {
    if (!canEdit) return;
    if (!window.confirm(`确定删除「${requirement.name}」吗？`)) return;
    setRequirements((current) => current.filter((item) => item.sourceId !== requirement.sourceId));
    const cloudRequirements = await deleteCloudRequirement(requirement.sourceId, editKey);
    if (cloudRequirements) {
      setRequirements(cloudRequirements);
      setSyncLabel("已删除该需求");
    } else {
      setError("删除失败：当前链接没有编辑权限或编辑密钥不正确");
    }
  }

  async function handleDeleteTable(name: string) {
    if (!canEdit) return;
    const rows = requirements.filter((item) => item.project === name);
    if (!window.confirm(`确定删除「${name}」表格及其 ${rows.length} 条需求吗？`)) return;
    setRequirements((current) => current.filter((item) => item.project !== name));
    const results = await Promise.all(rows.map((item) => deleteCloudRequirement(item.sourceId, editKey)));
    const latest = [...results].reverse().find(Boolean);
    if (latest) setRequirements(latest);
    setActiveTab("gantt");
    setSyncLabel("已删除需求表格");
  }

  function handleExportTable(name: string) {
    const rows = requirements.filter((item) => item.project === name);
    const header = ["name", "project", "owner", "productOwner", "status", "priority", "estimateHours", "dueDate", "note"];
    const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvCell(String(row[key as keyof DesignRequirement] ?? ""))).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportTable(name: string) {
    if (!canEdit) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const [, ...rows] = lines;
      for (const row of rows) {
        const [nameCell, , owner, productOwner, status, priority, estimateHours, dueDate, note] = row.split(",").map((cell) => cell.replace(/^"|"$/g, ""));
        await createManualRequirement({
          name: nameCell || "导入需求",
          project: name,
          owner,
          productOwner,
          requester: productOwner,
          status: (status || "待设计") as DesignRequirement["status"],
          priority: (priority || "P2") as DesignRequirement["priority"],
          estimateHours: Number(estimateHours || 8),
          dueDate,
          note
        }, editKey);
      }
      await handleLoad();
      setSyncLabel(`已导入 ${name}`);
    };
    input.click();
  }

  const totalHours = filtered.reduce((sum, item) => sum + item.estimateHours, 0);
  const blockedCount = filtered.filter((item) => item.status === "阻塞").length;
  const overloadCount = filtered.filter((item) => item.overCapacity).length;

  return (
    <main className="app-shell">
      <Toolbar
        filters={filters}
        owners={owners}
        requesters={requesters}
        syncLabel={syncLabel}
        loading={loading}
        canEdit={canEdit}
        onChange={setFilters}
        onSync={handleSync}
        onReschedule={() => {
          if (canEdit) setScheduleSeed(todayIso());
        }}
      />

      <ViewTabs
        activeTab={activeTab}
        tableNames={tableNames}
        canEdit={canEdit}
        onSelect={setActiveTab}
        onAddTable={handleAddTable}
        onRenameTable={handleRenameProject}
        onReorderTables={handleReorderTables}
        onDeleteTable={handleDeleteTable}
        onImportTable={handleImportTable}
        onExportTable={handleExportTable}
      />

      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={handleSync}>重试</button>
        </div>
      )}

      <section className="metrics">
        <div><strong>{filtered.length}</strong><span>需求</span></div>
        <div><strong>{totalHours}</strong><span>设计工时</span></div>
        <div><strong>{blockedCount}</strong><span>阻塞</span></div>
        <div><strong>{overloadCount}</strong><span>超载</span></div>
      </section>

      {activeTab === "gantt" && (
        <section className="board-shell">
          <SummaryRail loads={loads} />
          <GanttBoard
            requirements={filtered}
            owners={visibleOwners.length > 0 ? visibleOwners : [UNASSIGNED_OWNER]}
            rangeStart={filters.startDate || todayIso()}
            rangeEnd={filters.endDate || format(parseISO(todayIso()), "yyyy-MM-dd")}
            scale={ganttScale}
            canEdit={canEdit}
            onScaleChange={setGanttScale}
            onSelect={setSelected}
            onUpdate={handleUpdateRequirement}
          />
        </section>
      )}

      {activeTab !== "gantt" && (
        <section className="single-table-shell">
          <div className="table-command-bar">
            <button className="primary-button" onClick={() => handleAddRequirement(activeTab)} disabled={!canEdit}>+ 添加记录</button>
          </div>
          <RequirementTable
            requirements={activeTableRequirements}
            designOwners={owners}
            productOwners={productOwners}
            canEdit={canEdit}
            onSelect={setSelected}
            onUpdate={handleUpdateRequirement}
            onReorder={handleReorderRequirements}
            onInsertRow={handleInsertRow}
            onShareRow={handleShareRow}
            onDeleteRow={handleDeleteRow}
          />
        </section>
      )}

      <RequirementDrawer requirement={selected} canEdit={canEdit} onClose={() => setSelected(null)} onUpdate={handleUpdateRequirement} />
    </main>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function mergeRequirements(current: DesignRequirement[], incoming: DesignRequirement[]): DesignRequirement[] {
  const bySource = new Map(current.map((item) => [item.sourceId, item]));

  for (const next of incoming) {
    const existing = bySource.get(next.sourceId);
    bySource.set(next.sourceId, existing?.manualOverride ? { ...next, ...existing, syncedAt: next.syncedAt } : next);
  }

  return [...bySource.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => {
    if (a === UNASSIGNED_OWNER) return -1;
    if (b === UNASSIGNED_OWNER) return 1;
    return a.localeCompare(b, "zh-CN");
  });
}
