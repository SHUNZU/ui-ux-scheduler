import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { GanttBoard } from "./components/GanttBoard";
import { RequirementDrawer } from "./components/RequirementDrawer";
import { RequirementTable } from "./components/RequirementTable";
import { SummaryRail } from "./components/SummaryRail";
import { Toolbar } from "./components/Toolbar";
import { scheduleRequirements, summarizeOwnerLoads } from "./lib/scheduler";
import { todayIso, toIsoDate } from "./lib/date";
import { UNASSIGNED_OWNER } from "./lib/constants";
import { upsertRequirementsToBitable } from "./services/bitable";
import { saveRequirementPatch, syncProjectRequirements, triggerProjectSync } from "./services/projectSync";
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
  const [viewMode, setViewMode] = useState<"gantt" | "table" | "impact">("gantt");

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
    setLoading(true);
    setError("");
    try {
      const result = await triggerProjectSync();
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
    const patch: Partial<DesignRequirement> = {
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
    void saveRequirementPatch(updated.sourceId, patch).then((cloudRequirements) => {
      if (cloudRequirements) {
        setRequirements(cloudRequirements);
        setSyncLabel("已保存到云端排期");
      }
    });
  }

  const totalHours = filtered.reduce((sum, item) => sum + item.estimateHours, 0);
  const blockedCount = filtered.filter((item) => item.status === "阻塞").length;
  const overloadCount = filtered.filter((item) => item.overCapacity).length;

  return (
    <main className="app-shell">
      <Toolbar
        filters={filters}
        viewMode={viewMode}
        owners={owners}
        requesters={requesters}
        syncLabel={syncLabel}
        loading={loading}
        onChange={setFilters}
        onViewModeChange={setViewMode}
        onSync={handleSync}
        onReschedule={() => setScheduleSeed(todayIso())}
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

      {viewMode === "gantt" && (
        <section className="board-shell">
          <SummaryRail loads={loads} />
          <GanttBoard
            requirements={filtered}
            owners={visibleOwners.length > 0 ? visibleOwners : [UNASSIGNED_OWNER]}
            rangeStart={filters.startDate || todayIso()}
            rangeEnd={filters.endDate || format(parseISO(todayIso()), "yyyy-MM-dd")}
            onSelect={setSelected}
          />
        </section>
      )}

      {viewMode === "table" && (
        <RequirementTable
          requirements={filtered}
          designOwners={owners}
          productOwners={productOwners}
          onSelect={setSelected}
          onUpdate={handleUpdateRequirement}
        />
      )}

      {viewMode === "impact" && (
        <RequirementTable
          requirements={filtered.filter((item) => item.isRush || item.delayedDays > 0)}
          designOwners={owners}
          productOwners={productOwners}
          onSelect={setSelected}
          onUpdate={handleUpdateRequirement}
        />
      )}

      <RequirementDrawer requirement={selected} onClose={() => setSelected(null)} onUpdate={handleUpdateRequirement} />
    </main>
  );
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
