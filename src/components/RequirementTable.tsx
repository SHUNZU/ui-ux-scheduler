import { useMemo, useState } from "react";
import { ArrowUpRight, Flame, GripVertical, Link as LinkIcon, UserRound } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_COLORS, STATUS_OPTIONS } from "../lib/constants";
import { todayIso } from "../lib/date";
import { RequirementPriority, RequirementStatus, ScheduledRequirement } from "../types";

interface RequirementTableProps {
  requirements: ScheduledRequirement[];
  designOwners: string[];
  productOwners: string[];
  canEdit: boolean;
  onRequestEdit?: () => void;
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
  onReorder: (requirements: ScheduledRequirement[]) => void;
  onInsertRow?: (requirement: ScheduledRequirement, position: "above" | "below") => void;
  onShareRow?: (requirement: ScheduledRequirement) => void;
  onDeleteRow?: (requirement: ScheduledRequirement) => void;
}

type ColumnId =
  | "drag"
  | "index"
  | "name"
  | "project"
  | "owner"
  | "productOwner"
  | "priority"
  | "status"
  | "estimate"
  | "sequence"
  | "rush"
  | "schedule"
  | "delay"
  | "source";

interface ColumnConfig {
  id: ColumnId;
  label: string;
  width: number;
  fixed?: boolean;
}

const COLUMN_STORAGE_KEY = "uiux-scheduler-table-columns";
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "drag", label: "", width: 42, fixed: true },
  { id: "index", label: "#", width: 48, fixed: true },
  { id: "name", label: "需求名称", width: 220 },
  { id: "project", label: "项目", width: 140 },
  { id: "owner", label: "设计负责人", width: 150 },
  { id: "productOwner", label: "产品负责人", width: 150 },
  { id: "priority", label: "优先级", width: 110 },
  { id: "status", label: "状态", width: 120 },
  { id: "estimate", label: "预估(小时)", width: 100 },
  { id: "sequence", label: "顺序", width: 90 },
  { id: "rush", label: "插单", width: 90 },
  { id: "schedule", label: "排期", width: 220 },
  { id: "delay", label: "延期", width: 120 },
  { id: "source", label: "来源", width: 70 }
];

export function RequirementTable({
  requirements,
  designOwners,
  productOwners,
  canEdit,
  onRequestEdit = () => {},
  onSelect,
  onUpdate,
  onReorder,
  onInsertRow,
  onShareRow,
  onDeleteRow
}: RequirementTableProps) {
  const [columns, setColumns] = useState(loadColumns);
  const [draggingId, setDraggingId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [draggingColumnId, setDraggingColumnId] = useState<ColumnId | "">("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: ScheduledRequirement } | null>(null);
  const [editingNameId, setEditingNameId] = useState("");
  const [draftName, setDraftName] = useState("");
  const today = todayIso();

  const tableWidth = useMemo(() => columns.reduce((sum, column) => sum + column.width, 0), [columns]);

  const saveColumns = (next: ColumnConfig[]) => {
    setColumns(next);
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
  };

  const patch = (item: ScheduledRequirement, partial: Partial<ScheduledRequirement>) => {
    if (!canEdit) {
      onRequestEdit();
      return;
    }
    onUpdate({ ...item, ...partial, manualOverride: true });
  };

  const handleDrop = (target: ScheduledRequirement) => {
    if (!canEdit) {
      onRequestEdit();
      setDraggingId("");
      setDropTargetId("");
      return;
    }
    if (!draggingId || draggingId === target.sourceId) {
      setDraggingId("");
      setDropTargetId("");
      return;
    }

    const fromIndex = requirements.findIndex((item) => item.sourceId === draggingId);
    const toIndex = requirements.findIndex((item) => item.sourceId === target.sourceId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...requirements];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next.map((item, index) => ({ ...item, sequence: index + 1, manualOverride: true })));
    setDraggingId("");
    setDropTargetId("");
  };

  const moveColumn = (targetId: ColumnId) => {
    if (!draggingColumnId || draggingColumnId === targetId) {
      setDraggingColumnId("");
      return;
    }
    const fromIndex = columns.findIndex((column) => column.id === draggingColumnId);
    const toIndex = columns.findIndex((column) => column.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    saveColumns(next);
    setDraggingColumnId("");
  };

  const resizeColumn = (columnId: ColumnId, startX: number, startWidth: number) => {
    const handlePointerMove = (event: PointerEvent) => {
      const width = Math.max(46, Math.round(startWidth + event.clientX - startX));
      setColumns((current) => current.map((column) => column.id === columnId ? { ...column, width } : column));
    };
    const handlePointerUp = (event: PointerEvent) => {
      const width = Math.max(46, Math.round(startWidth + event.clientX - startX));
      const next = columns.map((column) => column.id === columnId ? { ...column, width } : column);
      saveColumns(next);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startRename = (item: ScheduledRequirement) => {
    setEditingNameId(item.sourceId);
    setDraftName(item.name);
  };

  const submitRename = (item: ScheduledRequirement) => {
    const nextName = draftName.trim();
    if (nextName && nextName !== item.name) {
      patch(item, { name: nextName });
    }
    setEditingNameId("");
    setDraftName("");
  };

  return (
    <section className="table-wrap" onClick={() => setContextMenu(null)}>
      <table className="data-table" style={{ minWidth: tableWidth }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={headerClassName(column)}
                style={{ width: column.width, minWidth: column.width, maxWidth: column.width }}
                draggable={!column.fixed}
                onDragStart={() => setDraggingColumnId(column.id)}
                onDragOver={(event) => {
                  if (!draggingColumnId || column.fixed) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!column.fixed) moveColumn(column.id);
                }}
              >
                <span>{column.label}</span>
                {!column.fixed && (
                  <span
                    className="column-resizer"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      resizeColumn(column.id, event.clientX, column.width);
                    }}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requirements.map((item, index) => (
            <tr
              key={item.sourceId}
              className={[
                draggingId === item.sourceId ? "dragging-row" : "",
                dropTargetId === item.sourceId ? "drop-target-row" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(item)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, item });
              }}
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                setDropTargetId(item.sourceId);
              }}
              onDragLeave={() => {
                if (dropTargetId === item.sourceId) setDropTargetId("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(item);
              }}
            >
              {columns.map((column) => (
                <td key={column.id} className={cellClassName(column)} style={{ width: column.width, minWidth: column.width, maxWidth: column.width }}>
                  {renderCell(column.id, item, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {contextMenu && (
        <div className="row-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => { startRename(contextMenu.item); setContextMenu(null); }}>编辑</button>
          <button disabled={!onInsertRow} onClick={() => { onInsertRow?.(contextMenu.item, "above"); setContextMenu(null); }}>向上插入行</button>
          <button disabled={!onInsertRow} onClick={() => { onInsertRow?.(contextMenu.item, "below"); setContextMenu(null); }}>向下插入行</button>
          <button disabled={!onShareRow} onClick={() => { onShareRow?.(contextMenu.item); setContextMenu(null); }}>分享该数据</button>
          <button className="danger" disabled={!onDeleteRow} onClick={() => { onDeleteRow?.(contextMenu.item); setContextMenu(null); }}>删除该数据</button>
        </div>
      )}
    </section>
  );

  function renderCell(columnId: ColumnId, item: ScheduledRequirement, index: number) {
    if (columnId === "drag") {
      return (
        <button
          className="drag-handle"
          draggable={canEdit}
          title="拖动调整排序"
          onClick={(event) => { event.stopPropagation(); if (!canEdit) onRequestEdit(); }}
          onDragStart={(event) => {
            event.stopPropagation();
            if (!canEdit) return;
            setDraggingId(item.sourceId);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.sourceId);
          }}
          onDragEnd={() => {
            setDraggingId("");
            setDropTargetId("");
          }}
        >
          <GripVertical size={15} />
        </button>
      );
    }
    if (columnId === "index") return index + 1;
    if (columnId === "name") {
      return (
        <div
          className="name-cell"
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(item);
          }}
        >
          {item.isRush && <Flame size={14} />}
          {editingNameId === item.sourceId ? (
            <input
              className="name-cell-input"
              value={draftName}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onBlur={() => submitRename(item)}
              onFocus={() => { if (!canEdit) onRequestEdit(); }}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitRename(item);
                if (event.key === "Escape") {
                  setEditingNameId("");
                  setDraftName("");
                }
              }}
            />
          ) : (
            <span title="双击修改需求名称">{item.name}</span>
          )}
        </div>
      );
    }
    if (columnId === "project") return item.project;
    if (columnId === "owner") {
      return <PersonSelect value={item.owner} fallback={item.ownerLane} options={designOwners} canEdit={canEdit} onRequestEdit={onRequestEdit} onChange={(owner) => patch(item, { owner })} />;
    }
    if (columnId === "productOwner") {
      return <PersonSelect value={item.productOwner} fallback={item.requester} options={productOwners} canEdit={canEdit} onRequestEdit={onRequestEdit} onChange={(productOwner) => patch(item, { productOwner, requester: productOwner })} />;
    }
    if (columnId === "priority") {
      return (
        <select className={`cell-select priority-cell priority-${item.priority.toLowerCase()}`} value={item.priority} onClick={(event) => { event.stopPropagation(); if (!canEdit) onRequestEdit(); }} onChange={(event) => patch(item, { priority: event.target.value as RequirementPriority })}>
          {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select>
      );
    }
    if (columnId === "status") {
      return (
        <select className="cell-select status-cell" value={item.status} style={{ color: STATUS_COLORS[item.status], borderColor: STATUS_COLORS[item.status] }} onClick={(event) => { event.stopPropagation(); if (!canEdit) onRequestEdit(); }} onChange={(event) => patch(item, { status: event.target.value as RequirementStatus })}>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      );
    }
    if (columnId === "estimate") {
      return <input className="cell-number" type="number" min={1} max={240} value={item.estimateHours} onClick={(event) => { event.stopPropagation(); if (!canEdit) onRequestEdit(); }} onChange={(event) => patch(item, { estimateHours: Number(event.target.value) })} />;
    }
    if (columnId === "sequence") {
      return <input className="cell-number" type="number" min={0} max={999} value={item.sequence} onClick={(event) => { event.stopPropagation(); if (!canEdit) onRequestEdit(); }} onChange={(event) => patch(item, { sequence: Number(event.target.value) })} />;
    }
    if (columnId === "rush") {
      return (
        <button className={`rush-toggle ${item.isRush ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); patch(item, { isRush: !item.isRush }); }} title="切换插单">
          <Flame size={14} />
          {item.isRush ? "是" : "否"}
        </button>
      );
    }
    if (columnId === "schedule") return `${item.scheduledStart} 至 ${item.scheduledEnd}`;
    if (columnId === "delay") {
      return item.scheduledEnd < today && item.status !== "已完成" ? (
        <span className="delay-tag overdue-tag">
          <ArrowUpRight size={13} />
          逾期 {item.delayedDays > 0 ? `${item.delayedDays} 工作日` : ""}
        </span>
      ) : "无";
    }
    return (
      <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        <LinkIcon size={14} />
      </a>
    );
  }
}

function loadColumns(): ColumnConfig[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(COLUMN_STORAGE_KEY) || "[]") as ColumnConfig[];
    const savedById = new Map(saved.map((column) => [column.id, column]));
    const merged = saved
      .filter((column) => DEFAULT_COLUMNS.some((item) => item.id === column.id))
      .map((column) => ({ ...DEFAULT_COLUMNS.find((item) => item.id === column.id)!, width: column.width }));
    for (const column of DEFAULT_COLUMNS) {
      if (!savedById.has(column.id)) merged.push(column);
    }
    return merged.length > 0 ? merged : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function headerClassName(column: ColumnConfig): string {
  return [
    column.id === "drag" ? "drag-head" : "",
    column.id === "index" ? "row-index-head" : "",
    !column.fixed ? "reorderable-column" : ""
  ].filter(Boolean).join(" ");
}

function cellClassName(column: ColumnConfig): string {
  return [
    column.id === "drag" ? "drag-cell" : "",
    column.id === "index" ? "row-index-cell" : ""
  ].filter(Boolean).join(" ");
}

function PersonSelect({
  value,
  fallback,
  options,
  canEdit,
  onRequestEdit,
  onChange
}: {
  value: string;
  fallback: string;
  options: string[];
  canEdit: boolean;
  onRequestEdit: () => void;
  onChange: (value: string) => void;
}) {
  const display = value || fallback || "待分配";
  const selectOptions = [...new Set([display, ...options].filter(Boolean))];

  return (
    <label className="person-cell" onClick={(event) => event.stopPropagation()}>
      <span className="avatar-dot"><UserRound size={13} /></span>
      <select value={display} onClick={() => { if (!canEdit) onRequestEdit(); }} onChange={(event) => onChange(event.target.value)}>
        {selectOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
