import { CalendarRange, Eye, PencilLine, RefreshCcw, WandSparkles } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../lib/constants";
import { Filters } from "../types";

interface ToolbarProps {
  filters: Filters;
  owners: string[];
  requesters: string[];
  syncLabel: string;
  loading: boolean;
  canEdit: boolean;
  onChange: (filters: Filters) => void;
  onSync: () => void;
  onReschedule: () => void;
}

export function Toolbar({
  filters,
  owners,
  requesters,
  syncLabel,
  loading,
  canEdit,
  onChange,
  onSync,
  onReschedule
}: ToolbarProps) {
  const patch = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <span className="eyebrow">UIUX Requirement Scheduler</span>
        <h1>UIUX 需求排期</h1>
      </div>

      <div className="toolbar-actions">
        <span className={`mode-badge ${canEdit ? "edit" : "readonly"}`}>
          {canEdit ? <PencilLine size={14} /> : <Eye size={14} />}
          {canEdit ? "编辑模式" : "只读模式"}
        </span>
        <button className="primary-button" onClick={onSync} disabled={loading || !canEdit} title={canEdit ? "重新同步飞书项目需求" : "只读模式不可同步"}>
          <RefreshCcw size={16} />
          {loading ? "同步中" : "重新同步"}
        </button>
        <button className="ghost-button" onClick={onReschedule} disabled={!canEdit} title={canEdit ? "按优先级重新自动排期" : "只读模式不可重新排期"}>
          <WandSparkles size={16} />
          重新排期
        </button>
      </div>

      <div className="filters">
        <select value={filters.requester} onChange={(event) => patch({ requester: event.target.value })}>
          <option value="">全部下发人</option>
          {requesters.map((requester) => (
            <option key={requester} value={requester}>{requester}</option>
          ))}
        </select>
        <select value={filters.owner} onChange={(event) => patch({ owner: event.target.value })}>
          <option value="">全部负责人</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => patch({ status: event.target.value })}>
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select value={filters.priority} onChange={(event) => patch({ priority: event.target.value })}>
          <option value="">全部优先级</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>{priority}</option>
          ))}
        </select>
        <label className="date-filter">
          <CalendarRange size={15} />
          <input type="date" value={filters.startDate} onChange={(event) => patch({ startDate: event.target.value })} />
        </label>
        <label className="date-filter">
          <CalendarRange size={15} />
          <input type="date" value={filters.endDate} onChange={(event) => patch({ endDate: event.target.value })} />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.overloadedOnly}
            onChange={(event) => patch({ overloadedOnly: event.target.checked })}
          />
          只看超载
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.blockedOnly}
            onChange={(event) => patch({ blockedOnly: event.target.checked })}
          />
          只看阻塞
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.rushOnly}
            onChange={(event) => patch({ rushOnly: event.target.checked })}
          />
          只看插单
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.delayedOnly}
            onChange={(event) => patch({ delayedOnly: event.target.checked })}
          />
          只看延期
        </label>
      </div>

      <div className="sync-meta">{syncLabel}</div>
    </header>
  );
}
