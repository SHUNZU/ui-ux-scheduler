import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
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
  requesters: [],
  owners: [],
  statuses: [],
  priorities: [],
  startDate: "",
  endDate: "",
  overloadedOnly: false,
  blockedOnly: false,
  rushOnly: false,
  delayedOnly: false
};
const ADMIN_PASSWORD = "admin";
const EDIT_SESSION_KEY = "uiux-scheduler-edit-session";
const EDIT_SESSION_DAYS = 7;
const DEFAULT_FEISHU_URL_KEY = "uiux-scheduler-default-feishu-url";

export default function App() {
  const [requirements, setRequirements] = useState<DesignRequirement[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selected, setSelected] = useState<ScheduledRequirement | null>(null);
  const [syncLabel, setSyncLabel] = useState("等待首次同步");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scheduleSeed, setScheduleSeed] = useState(todayIso());
  const [defaultFeishuUrl, setDefaultFeishuUrl] = useState(() => window.localStorage.getItem(DEFAULT_FEISHU_URL_KEY) || "");
  const [specifiedFeishuUrl, setSpecifiedFeishuUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("gantt");
  const [ganttScale, setGanttScale] = useState<"week" | "month" | "quarter">("week");
  const [canEdit, setCanEdit] = useState(() => hasValidEditSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProjects, setExportProjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedRequirementId, setFocusedRequirementId] = useState("");

  useEffect(() => {
    void handleLoad();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DEFAULT_FEISHU_URL_KEY, defaultFeishuUrl);
  }, [defaultFeishuUrl]);

  const scheduled = useMemo(() => scheduleRequirements(requirements, scheduleSeed), [requirements, scheduleSeed]);
  const filtered = useMemo(() => {
    return scheduled.filter((item) => {
      if (filters.requesters.length > 0 && !filters.requesters.includes(item.requester)) return false;
      if (filters.owners.length > 0 && !filters.owners.includes(item.ownerLane)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false;
      if (filters.priorities.length > 0 && !filters.priorities.includes(item.priority)) return false;
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
  const ganttRange = useMemo(() => {
    if (filters.startDate || filters.endDate) {
      const fallbackStart = todayIso();
      const fallbackEnd = toIsoDate(addDays(new Date(), 30));
      return {
        start: filters.startDate || fallbackStart,
        end: filters.endDate || fallbackEnd
      };
    }

    if (filtered.length === 0) {
      return {
        start: todayIso(),
        end: toIsoDate(addDays(new Date(), 30))
      };
    }

    const starts = filtered.map((item) => item.scheduledStart).filter(Boolean).sort();
    const ends = filtered.map((item) => item.scheduledEnd).filter(Boolean).sort();
    return {
      start: starts[0] || todayIso(),
      end: ends[ends.length - 1] || toIsoDate(addDays(new Date(), 30))
    };
  }, [filtered, filters.startDate, filters.endDate]);
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
  const exportProjectOptions = useMemo(() => tableNames.filter(Boolean), [tableNames]);
  const activeTableRequirements = useMemo(
    () => filtered
      .filter((item) => (item.project || "需求表格") === activeTab)
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt)),
    [filtered, activeTab]
  );
  const selectedRequirement = useMemo(() => {
    if (!selected) return null;
    return scheduled.find((item) => item.sourceId === selected.sourceId) ?? null;
  }, [selected, scheduled]);
  const searchSuggestions = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return [];
    const matches = scheduled
      .filter((item) => item.name.toLowerCase().includes(keyword))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || (a.project || "").localeCompare(b.project || "", "zh-CN"))
      .slice(0, 12);
    const projectsByName = new Map<string, Set<string>>();
    for (const item of scheduled) {
      const name = item.name.trim();
      if (!name) continue;
      if (!projectsByName.has(name)) projectsByName.set(name, new Set());
      projectsByName.get(name)!.add(item.project || "未归属项目");
    }
    return matches.map((item) => ({
      item,
      showProjectTag: (projectsByName.get(item.name.trim())?.size || 0) > 1
    }));
  }, [scheduled, searchQuery]);

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

  async function handleDefaultSync() {
    await syncFromFeishuUrl(defaultFeishuUrl);
  }

  async function handleSpecifiedSync() {
    await syncFromFeishuUrl(specifiedFeishuUrl);
  }

  async function syncFromFeishuUrl(sourceUrl: string) {
    if (!ensureEditAccess()) return;
    setLoading(true);
    setError("");
    try {
      const result = await triggerProjectSync(getEditKey(), sourceUrl);
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
    if (!ensureEditAccess()) return;
    setError("");
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
    void saveRequirementPatch(updated.sourceId, patch, getEditKey()).then((cloudRequirements) => {
      if (cloudRequirements) {
        setRequirements(cloudRequirements);
        setError("");
        setSyncLabel("已保存到云端排期");
      } else {
        setError("保存失败：请确认管理员密码已解锁");
      }
    }).catch((saveError) => {
      setError(errorMessage(saveError, "保存失败"));
    });
  }

  function handleReorderRequirements(reorderedVisible: ScheduledRequirement[]) {
    const activeProject = activeTab;
    const visibleIds = new Set(reorderedVisible.map((item) => item.sourceId));
    const visibleQueue = [...reorderedVisible];
    const fullOrder = scheduled
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt))
      .filter((item) => (item.project || "需求表格") === activeProject)
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
    setError("");
    if (!canEdit) {
      setSyncLabel(`已调整 ${patches.length} 条需求排序`);
      return;
    }

    setSyncLabel(`已调整 ${patches.length} 条需求排序，正在保存`);

    void Promise.all(
      patches.map((patch) => saveRequirementPatch(patch.sourceId, { sequence: patch.sequence, manualOverride: true }, getEditKey()))
    ).then((results) => {
      const latest = [...results].reverse().find(Boolean);
      if (latest) {
        setRequirements(latest);
        setError("");
        setSyncLabel("已保存拖动排序");
      }
    }).catch((saveError) => {
      setError(errorMessage(saveError, "排序保存失败"));
    });
  }

  async function handleAddTable() {
    if (!ensureEditAccess()) return;
    const projectName = window.prompt("请输入需求表格名称", `需求表格 ${tableNames.length + 1}`)?.trim();
    if (!projectName) return;
    await handleAddRequirement(projectName);
    setActiveTab(projectName);
  }

  async function handleAddRequirement(project: string, sequence?: number) {
    if (!ensureEditAccess()) return;
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
    setError("");
    setSyncLabel(`已新增 ${project} / 新需求，正在保存`);

    try {
      const cloudRequirements = await createManualRequirement(next, getEditKey());
      if (cloudRequirements) {
        setRequirements(cloudRequirements);
        setError("");
        setSyncLabel("已保存新增需求");
      } else {
        setError("新增需求失败：请确认管理员密码已解锁");
      }
    } catch (saveError) {
      setError(errorMessage(saveError, "新增需求失败"));
    }
  }

  function handleRenameProject(fromProject: string, toProject: string) {
    if (!ensureEditAccess() || !fromProject || !toProject || fromProject === toProject) return;
    const affected = requirements.filter((item) => item.project === fromProject);
    if (affected.length === 0) return;

    setRequirements((current) =>
      current.map((item) => (item.project === fromProject ? { ...item, project: toProject, manualOverride: true } : item))
    );
    setActiveTab(toProject);
    setError("");
    setSyncLabel(`已将 ${fromProject} 改名为 ${toProject}，正在保存`);

    void Promise.all(
      affected.map((item) => saveRequirementPatch(item.sourceId, { project: toProject, manualOverride: true }, getEditKey()))
    ).then((results) => {
      const latest = [...results].reverse().find(Boolean);
      if (latest) {
        setRequirements(latest);
        setError("");
        setSyncLabel("已保存项目表名称");
      }
    }).catch((saveError) => {
      setError(errorMessage(saveError, "项目表改名保存失败"));
    });
  }

  function handleReorderTables(nextNames: string[]) {
    if (!ensureEditAccess()) return;
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
    setError("");
    void Promise.all(patches.map((patch) => saveRequirementPatch(patch.sourceId, { sequence: patch.sequence, manualOverride: true }, getEditKey())))
      .then((results) => {
        const latest = [...results].reverse().find(Boolean);
        if (latest) setRequirements(latest);
        setError("");
        setSyncLabel("已保存表格顺序");
      })
      .catch((saveError) => {
        setError(errorMessage(saveError, "表格顺序保存失败"));
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

  function ensureEditAccess(): boolean {
    if (hasValidEditSession()) {
      if (!canEdit) setCanEdit(true);
      setAuthOpen(false);
      setAuthError("");
      return true;
    }
    if (canEdit) setCanEdit(false);
    setAuthOpen(true);
    setAuthError("");
    return false;
  }

  function getEditKey(): string {
    if (hasValidEditSession()) return ADMIN_PASSWORD;
    setCanEdit(false);
    setAuthOpen(true);
    setAuthError("编辑权限已过期，请重新输入管理员密码");
    return "";
  }

  function handleUnlockEdit() {
    if (authPassword.trim() !== ADMIN_PASSWORD) {
      setAuthError("管理员密码不正确");
      return;
    }
    const expiresAt = Date.now() + EDIT_SESSION_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(EDIT_SESSION_KEY, String(expiresAt));
    setCanEdit(true);
    setAuthOpen(false);
    setAuthPassword("");
    setAuthError("");
  }

  async function handleDeleteRow(requirement: ScheduledRequirement) {
    if (!ensureEditAccess()) return;
    if (!window.confirm(`确定删除「${requirement.name}」吗？`)) return;
    setRequirements((current) => current.filter((item) => item.sourceId !== requirement.sourceId));
    setError("");
    try {
      const cloudRequirements = await deleteCloudRequirement(requirement.sourceId, getEditKey());
      if (cloudRequirements) {
        setRequirements(cloudRequirements);
        setError("");
        setSyncLabel("已删除该需求");
      } else {
        setError("删除失败：请确认管理员密码已解锁");
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError, "删除失败"));
    }
  }

  async function handleDeleteTable(name: string) {
    if (!ensureEditAccess()) return;
    const rows = requirements.filter((item) => item.project === name);
    if (!window.confirm(`确定删除「${name}」表格及其 ${rows.length} 条需求吗？`)) return;
    setRequirements((current) => current.filter((item) => item.project !== name));
    setError("");
    try {
      const results = await Promise.all(rows.map((item) => deleteCloudRequirement(item.sourceId, getEditKey())));
      const latest = [...results].reverse().find(Boolean);
      if (latest) setRequirements(latest);
      setActiveTab("gantt");
      setError("");
      setSyncLabel("已删除需求表格");
    } catch (deleteError) {
      setError(errorMessage(deleteError, "删除表格失败"));
    }
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

  function handleOpenExport() {
    setExportProjects(exportProjectOptions);
    setExportOpen(true);
  }

  function toggleExportProject(name: string) {
    setExportProjects((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  }

  function handleConfirmExport() {
    const selectedProjects = exportProjects;
    const selectedSet = new Set(selectedProjects);
    const rows = scheduled
      .filter((item) => selectedSet.has(item.project || "需求表格"))
      .sort((a, b) => (a.project || "").localeCompare(b.project || "", "zh-CN") || a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));

    exportRequirementsCsv(rows, selectedProjects.length === exportProjectOptions.length ? "全部项目" : selectedProjects.join("_"));
    setExportOpen(false);
    setSyncLabel(`已导出 ${rows.length} 条需求数据`);
  }

  function handleSelectSearchRequirement(item: ScheduledRequirement) {
    setFilters(initialFilters);
    setActiveTab(item.project || "需求表格");
    setSelected(item);
    setFocusedRequirementId(item.sourceId);
    setSearchQuery(item.name);
    setSyncLabel(`已定位到 ${item.project || "未归属项目"} / ${item.name}`);
  }

  function handleSearchSubmit() {
    const first = searchSuggestions[0]?.item;
    if (first) handleSelectSearchRequirement(first);
  }

  function handleImportTable(name: string) {
    if (!ensureEditAccess()) return;
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
        }, getEditKey());
      }
      await handleLoad();
      setSyncLabel(`已导入 ${name}`);
    };
    input.click();
  }

  const totalHours = Math.round(filtered.reduce((sum, item) => sum + item.estimateHours, 0) * 10) / 10;
  const blockedCount = filtered.filter((item) => item.status === "阻塞").length;
  const overloadCount = filtered.filter((item) => item.overCapacity).length;

  return (
    <main className="app-shell">
      <Toolbar
        filters={filters}
        owners={owners}
        requesters={requesters}
        syncLabel={syncLabel}
        defaultFeishuUrl={defaultFeishuUrl}
        specifiedFeishuUrl={specifiedFeishuUrl}
        settingsOpen={settingsOpen}
        searchQuery={searchQuery}
        searchSuggestions={searchSuggestions}
        loading={loading}
        canEdit={canEdit}
        onRequestEdit={ensureEditAccess}
        onChange={setFilters}
        onDefaultFeishuUrlChange={setDefaultFeishuUrl}
        onSpecifiedFeishuUrlChange={setSpecifiedFeishuUrl}
        onSettingsOpenChange={setSettingsOpen}
        onSearchQueryChange={setSearchQuery}
        onSelectSearchSuggestion={handleSelectSearchRequirement}
        onSearchSubmit={handleSearchSubmit}
        onDefaultSync={handleDefaultSync}
        onSpecifiedSync={handleSpecifiedSync}
        onOpenExport={handleOpenExport}
      />

      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={handleDefaultSync}>重试</button>
        </div>
      )}

      <section className="metrics">
        <div><strong>{filtered.length}</strong><span>需求</span></div>
        <div><strong>{totalHours}</strong><span>设计工时</span></div>
        <div><strong>{blockedCount}</strong><span>阻塞</span></div>
        <div><strong>{overloadCount}</strong><span>超载</span></div>
      </section>

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

      {activeTab === "gantt" && (
        <section className="board-shell">
          <SummaryRail loads={loads} />
          <GanttBoard
            requirements={filtered}
            owners={visibleOwners.length > 0 ? visibleOwners : [UNASSIGNED_OWNER]}
            rangeStart={ganttRange.start}
            rangeEnd={ganttRange.end}
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
            <button className="primary-button" onClick={() => handleAddRequirement(activeTab)}>+ 添加记录</button>
          </div>
          <RequirementTable
            requirements={activeTableRequirements}
            designOwners={owners}
            productOwners={productOwners}
            canEdit={canEdit}
            onRequestEdit={ensureEditAccess}
            onSelect={setSelected}
            onUpdate={handleUpdateRequirement}
            onReorder={handleReorderRequirements}
            onInsertRow={handleInsertRow}
            onShareRow={handleShareRow}
            onDeleteRow={handleDeleteRow}
            focusSourceId={focusedRequirementId}
          />
        </section>
      )}

      <RequirementDrawer requirement={selectedRequirement} canEdit={canEdit} onClose={() => setSelected(null)} onRequestEdit={ensureEditAccess} onUpdate={handleUpdateRequirement} />
      {exportOpen && (
        <div className="modal-backdrop" onClick={() => setExportOpen(false)}>
          <section className="export-dialog" onClick={(event) => event.stopPropagation()}>
            <h2>选择要导出数据</h2>
            <div className="export-options">
              {exportProjectOptions.map((name) => (
                <label key={name} className="export-option">
                  <input
                    type="checkbox"
                    checked={exportProjects.includes(name)}
                    onChange={() => toggleExportProject(name)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <div className="export-actions">
              <button type="button" className="ghost-button" onClick={() => setExportOpen(false)}>取消</button>
              <button type="button" className="primary-button" onClick={handleConfirmExport} disabled={exportProjects.length === 0}>确认导出</button>
            </div>
          </section>
        </div>
      )}
      {authOpen && (
        <div className="auth-backdrop" onClick={() => setAuthOpen(false)}>
          <form
            className="auth-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              handleUnlockEdit();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>输入管理员密码</h2>
            <p>解锁后可以编辑需求、同步飞书、调整排期。有效期 7 天。</p>
            <input
              type="password"
              value={authPassword}
              autoFocus
              placeholder="管理员密码"
              onChange={(event) => setAuthPassword(event.target.value)}
            />
            {authError && <span className="auth-error">{authError}</span>}
            <div className="auth-actions">
              <button type="button" className="ghost-button" onClick={() => setAuthOpen(false)}>取消</button>
              <button type="submit" className="primary-button">确认</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function hasValidEditSession(): boolean {
  const expiresAt = Number(window.localStorage.getItem(EDIT_SESSION_KEY) || 0);
  return expiresAt > Date.now();
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function exportRequirementsCsv(rows: ScheduledRequirement[], scopeName: string): void {
  const header: Array<[string, (row: ScheduledRequirement) => string | number | boolean | undefined | null]> = [
    ["需求名称", (row) => row.name],
    ["项目", (row) => row.project],
    ["设计负责人", (row) => row.owner],
    ["产品负责人", (row) => row.productOwner],
    ["下发人", (row) => row.requester],
    ["状态", (row) => row.status],
    ["优先级", (row) => row.priority],
    ["预估(小时)", (row) => row.estimateHours],
    ["顺序", (row) => row.sequence],
    ["插单", (row) => row.isRush ? "是" : "否"],
    ["开始日期", (row) => row.startDate || row.scheduledStart],
    ["截止日期", (row) => row.dueDate || row.scheduledEnd],
    ["排期开始", (row) => row.scheduledStart],
    ["排期结束", (row) => row.scheduledEnd],
    ["延期(工作日)", (row) => row.delayedDays],
    ["阻塞原因", (row) => row.blockedReason],
    ["插单原因", (row) => row.rushReason],
    ["备注", (row) => row.note],
    ["来源链接", (row) => row.sourceUrl]
  ];
  const csv = [
    header.map(([label]) => csvCell(label)).join(","),
    ...rows.map((row) => header.map(([, getValue]) => csvCell(String(getValue(row) ?? ""))).join(","))
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `UIUX需求排期-${scopeName || "导出"}-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
