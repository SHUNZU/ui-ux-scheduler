import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Download, Link, PencilLine, RefreshCcw, Search, Settings } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../lib/constants";
import { Filters, ScheduledRequirement } from "../types";

export interface SearchSuggestion {
  item: ScheduledRequirement;
  showProjectTag: boolean;
}

interface ToolbarProps {
  filters: Filters;
  owners: string[];
  requesters: string[];
  syncLabel: string;
  defaultFeishuUrl: string;
  specifiedFeishuUrl: string;
  settingsOpen: boolean;
  searchQuery: string;
  searchSuggestions: SearchSuggestion[];
  loading: boolean;
  canEdit: boolean;
  onRequestEdit: () => void;
  onChange: (filters: Filters) => void;
  onDefaultFeishuUrlChange: (value: string) => void;
  onSpecifiedFeishuUrlChange: (value: string) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectSearchSuggestion: (item: ScheduledRequirement) => void;
  onSearchSubmit: () => void;
  onDefaultSync: () => void;
  onSpecifiedSync: () => void;
  onOpenExport: () => void;
}

export function Toolbar({
  filters,
  owners,
  requesters,
  syncLabel,
  defaultFeishuUrl,
  specifiedFeishuUrl,
  settingsOpen,
  searchQuery,
  searchSuggestions,
  loading,
  canEdit,
  onRequestEdit,
  onChange,
  onDefaultFeishuUrlChange,
  onSpecifiedFeishuUrlChange,
  onSettingsOpenChange,
  onSearchQueryChange,
  onSelectSearchSuggestion,
  onSearchSubmit,
  onDefaultSync,
  onSpecifiedSync,
  onOpenExport
}: ToolbarProps) {
  const patch = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });
  const toggleValue = (values: string[], value: string) =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const toolbarRef = useRef<HTMLElement | null>(null);
  const [openFilter, setOpenFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!toolbarRef.current?.contains(target)) {
        setOpenFilter("");
        setSearchOpen(false);
        onSettingsOpenChange(false);
        return;
      }
      if (!target.closest(".multi-filter, .settings-anchor, .requirement-search")) {
        setOpenFilter("");
        setSearchOpen(false);
        onSettingsOpenChange(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onSettingsOpenChange]);

  return (
    <header className="toolbar" ref={toolbarRef}>
      <div className="toolbar-title">
        <span className="eyebrow">UIUX Requirement Scheduler</span>
        <h1>UIUX 需求排期</h1>
      </div>

      <div className="toolbar-actions">
        <label className="feishu-sync-input specified" title="粘贴飞书多维表格链接后，可只同步这个表格">
          <Link size={15} />
          <input
            type="url"
            value={specifiedFeishuUrl}
            placeholder="粘贴飞书多维表格链接"
            onChange={(event) => onSpecifiedFeishuUrlChange(event.target.value)}
          />
        </label>
        <button className="ghost-button" onClick={onSpecifiedSync} disabled={loading || !specifiedFeishuUrl.trim()} type="button" title="同步左侧输入框里的飞书表格">
          <RefreshCcw size={16} />
          指定同步
        </button>
        <div className="settings-anchor">
          <button className="icon-button" onClick={() => onSettingsOpenChange(!settingsOpen)} type="button" title="设置默认同步链接">
            <Settings size={17} />
          </button>
          {settingsOpen && (
            <div className="settings-popover">
              <strong>同步设置</strong>
              <label>
                <span>默认同步飞书链接</span>
                <textarea
                  value={defaultFeishuUrl}
                  placeholder="粘贴默认飞书多维表格链接"
                  onChange={(event) => onDefaultFeishuUrlChange(event.target.value)}
                />
              </label>
              <button className="ghost-button" type="button" onClick={() => onSettingsOpenChange(false)}>完成</button>
            </div>
          )}
        </div>
        <button className="primary-button default-sync-button" onClick={onDefaultSync} disabled={loading} type="button" title={canEdit ? "同步设置里的默认飞书链接" : "输入管理员密码后同步"}>
          <RefreshCcw size={16} />
          {loading ? "同步中" : "默认同步"}
        </button>
        <span className="toolbar-divider" />
        <button className="ghost-button export-button" onClick={onOpenExport} type="button" title="导出需求数据">
          <Download size={16} />
          导出
        </button>
      </div>

      <div className="filter-row">
        <div className="filters">
          <MultiFilter
            id="requesters"
            label="下发人"
            allLabel="全部下发人"
            options={requesters}
            values={filters.requesters}
            open={openFilter === "requesters"}
            onOpenChange={(open) => setOpenFilter(open ? "requesters" : "")}
            onChange={(value) => patch({ requesters: toggleValue(filters.requesters, value) })}
            onClear={() => patch({ requesters: [] })}
          />
          <MultiFilter
            id="owners"
            label="负责人"
            allLabel="全部负责人"
            options={owners}
            values={filters.owners}
            open={openFilter === "owners"}
            onOpenChange={(open) => setOpenFilter(open ? "owners" : "")}
            onChange={(value) => patch({ owners: toggleValue(filters.owners, value) })}
            onClear={() => patch({ owners: [] })}
          />
          <MultiFilter
            id="statuses"
            label="状态"
            allLabel="全部状态"
            options={[...STATUS_OPTIONS]}
            values={filters.statuses}
            open={openFilter === "statuses"}
            onOpenChange={(open) => setOpenFilter(open ? "statuses" : "")}
            onChange={(value) => patch({ statuses: toggleValue(filters.statuses, value) })}
            onClear={() => patch({ statuses: [] })}
          />
          <MultiFilter
            id="priorities"
            label="优先级"
            allLabel="全部优先级"
            options={[...PRIORITY_OPTIONS]}
            values={filters.priorities}
            open={openFilter === "priorities"}
            onOpenChange={(open) => setOpenFilter(open ? "priorities" : "")}
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
        <div className="requirement-search">
          <input
            type="search"
            value={searchQuery}
            placeholder="搜索需求名称"
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchOpen(true);
              onSearchQueryChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchSubmit();
            }}
          />
          {searchOpen && searchQuery.trim() && searchSuggestions.length > 0 && (
            <div className="requirement-search-menu">
              {searchSuggestions.map(({ item, showProjectTag }) => (
                <button key={item.sourceId} type="button" onClick={() => { onSelectSearchSuggestion(item); setSearchOpen(false); }}>
                  <span>{item.name}</span>
                  {showProjectTag && <em>{item.project || "未归属项目"}</em>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="ghost-button search-button" type="button" onClick={onSearchSubmit} disabled={searchSuggestions.length === 0}>
          <Search size={16} />
          搜索
        </button>
        <span className="toolbar-divider" />
        <button className={`mode-badge edit-button ${canEdit ? "edit" : "readonly"}`} onClick={onRequestEdit} type="button" title={canEdit ? "已解锁编辑权限" : "输入管理员密码解锁编辑"}>
          <PencilLine size={14} />
          编辑
        </button>
      </div>

      <div className="sync-meta">{syncLabel}</div>
    </header>
  );
}

interface MultiFilterProps {
  id: string;
  label: string;
  allLabel: string;
  options: string[];
  values: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onClear: () => void;
}

function MultiFilter({ id, label, allLabel, options, values, open, onOpenChange, onChange, onClear }: MultiFilterProps) {
  const summary = values.length === 0
    ? allLabel
    : values.length === 1
      ? values[0]
      : `${label} ${values.length} 项`;

  return (
    <div className="multi-filter" data-filter-id={id}>
      <button type="button" className="multi-filter-trigger" onClick={() => onOpenChange(!open)}>
        <span>{summary}</span>
        <ChevronDown size={14} />
      </button>
      {open && <div className="multi-filter-menu">
        <button type="button" className="multi-filter-clear" onClick={() => { onClear(); onOpenChange(false); }}>全部</button>
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
      </div>}
    </div>
  );
}
