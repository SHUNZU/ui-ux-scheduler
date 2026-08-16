import { CalendarRange, ChevronDown, Eye, PencilLine, RefreshCcw } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../lib/constants";
import { Filters } from "../types";

interface ToolbarProps {
  filters: Filters;
  owners: string[];
  requesters: string[];
  syncLabel: string;
  loading: boolean;
  canEdit: boolean;
  onRequestEdit: () => void;
  onChange: (filters: Filters) => void;
  onSync: () => void;
}

export function Toolbar({
  filters,
  owners,
  requesters,
  syncLabel,
  loading,
  canEdit,
  onRequestEdit,
  onChange,
  onSync
}: ToolbarProps) {
  const patch = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });
  const toggleValue = (values: string[], value: string) =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <span className="eyebrow">UIUX Requirement Scheduler</span>
        <h1>UIUX 需求排期</h1>
      </div>

      <div className="toolbar-actions">
        <button className={`mode-badge ${canEdit ? "edit" : "readonly"}`} onClick={onRequestEdit} type="button" title={canEdit ? "已解锁编辑权限" : "输入管理员密码解锁编辑"}>
          {canEdit ? <PencilLine size={14} /> : <Eye size={14} />}
          编辑
        </button>
        <button className="primary-button" onClick={onSync} disabled={loading} title={canEdit ? "重新同步飞书项目需求" : "输入管理员密码后同步"}>
          <RefreshCcw size={16} />
          {loading ? "同步中" : "重新同步"}
        </button>
      </div>

      <div className="filters">
        <MultiFilter
          label="下发人"
          allLabel="全部下发人"
          options={requesters}
          values={filters.requesters}
          onChange={(value) => patch({ requesters: toggleValue(filters.requesters, value) })}
          onClear={() => patch({ requesters: [] })}
        />
        <MultiFilter
          label="负责人"
          allLabel="全部负责人"
          options={owners}
          values={filters.owners}
          onChange={(value) => patch({ owners: toggleValue(filters.owners, value) })}
          onClear={() => patch({ owners: [] })}
        />
        <MultiFilter
          label="状态"
          allLabel="全部状态"
          options={[...STATUS_OPTIONS]}
          values={filters.statuses}
          onChange={(value) => patch({ statuses: toggleValue(filters.statuses, value) })}
          onClear={() => patch({ statuses: [] })}
        />
        <MultiFilter
          label="优先级"
          allLabel="全部优先级"
          options={[...PRIORITY_OPTIONS]}
          values={filters.priorities}
          onChange={(value) => patch({ priorities: toggleValue(filters.priorities, value) })}
          onClear={() => patch({ priorities: [] })}
        />
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

interface MultiFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  values: string[];
  onChange: (value: string) => void;
  onClear: () => void;
}

function MultiFilter({ label, allLabel, options, values, onChange, onClear }: MultiFilterProps) {
  const summary = values.length === 0
    ? allLabel
    : values.length === 1
      ? values[0]
      : `${label} ${values.length} 项`;

  return (
    <details className="multi-filter">
      <summary>
        <span>{summary}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="multi-filter-menu">
        <button type="button" className="multi-filter-clear" onClick={onClear}>全部</button>
        {options.map((option) => (
          <label key={option} className="multi-filter-option">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
