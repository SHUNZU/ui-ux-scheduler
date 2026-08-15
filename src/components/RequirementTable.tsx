import { useState } from "react";
import { ArrowUpRight, Flame, GripVertical, Link as LinkIcon, UserRound } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_COLORS, STATUS_OPTIONS } from "../lib/constants";
import { todayIso } from "../lib/date";
import { RequirementPriority, RequirementStatus, ScheduledRequirement } from "../types";

interface RequirementTableProps {
  requirements: ScheduledRequirement[];
  designOwners: string[];
  productOwners: string[];
  canEdit: boolean;
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
  onReorder: (requirements: ScheduledRequirement[]) => void;
  onInsertRow?: (requirement: ScheduledRequirement, position: "above" | "below") => void;
  onShareRow?: (requirement: ScheduledRequirement) => void;
  onDeleteRow?: (requirement: ScheduledRequirement) => void;
}

export function RequirementTable({
  requirements,
  designOwners,
  productOwners,
  canEdit,
  onSelect,
  onUpdate,
  onReorder,
  onInsertRow,
  onShareRow,
  onDeleteRow
}: RequirementTableProps) {
  const [draggingId, setDraggingId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: ScheduledRequirement } | null>(null);
  const [editingNameId, setEditingNameId] = useState("");
  const [draftName, setDraftName] = useState("");
  const today = todayIso();

  const patch = (item: ScheduledRequirement, partial: Partial<ScheduledRequirement>) => {
    if (!canEdit) return;
    onUpdate({ ...item, ...partial, manualOverride: true });
  };

  const handleDrop = (target: ScheduledRequirement) => {
    if (!canEdit || !draggingId || draggingId === target.sourceId) {
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

  const startRename = (item: ScheduledRequirement) => {
    if (!canEdit) return;
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
      <table className="data-table">
        <thead>
          <tr>
            <th className="drag-head"></th>
            <th className="row-index-head">#</th>
            <th>需求名称</th>
            <th>项目</th>
            <th>设计负责人</th>
            <th>产品负责人</th>
            <th>优先级</th>
            <th>状态</th>
            <th>预估</th>
            <th>顺序</th>
            <th>插单</th>
            <th>排期</th>
            <th>延期</th>
            <th>来源</th>
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
                if (!canEdit || !draggingId) return;
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
              <td className="drag-cell">
                <button
                  className="drag-handle"
                  draggable={canEdit}
                  disabled={!canEdit}
                  title={canEdit ? "拖动调整排序" : "只读模式不可排序"}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
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
              </td>
              <td className="row-index-cell">{index + 1}</td>
              <td>
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
                    <span title={canEdit ? "双击修改需求名称" : item.name}>{item.name}</span>
                  )}
                </div>
              </td>
              <td>{item.project}</td>
              <td>
                <PersonSelect
                  value={item.owner}
                  fallback={item.ownerLane}
                  options={designOwners}
                  disabled={!canEdit}
                  onChange={(owner) => patch(item, { owner })}
                />
              </td>
              <td>
                <PersonSelect
                  value={item.productOwner}
                  fallback={item.requester}
                  options={productOwners}
                  disabled={!canEdit}
                  onChange={(productOwner) => patch(item, { productOwner, requester: productOwner })}
                />
              </td>
              <td>
                <select
                  className={`cell-select priority-cell priority-${item.priority.toLowerCase()}`}
                  value={item.priority}
                  disabled={!canEdit}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patch(item, { priority: event.target.value as RequirementPriority })}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  className="cell-select status-cell"
                  value={item.status}
                  disabled={!canEdit}
                  style={{ color: STATUS_COLORS[item.status], borderColor: STATUS_COLORS[item.status] }}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patch(item, { status: event.target.value as RequirementStatus })}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="cell-number"
                  type="number"
                  min={1}
                  max={80}
                  value={item.estimateHours}
                  disabled={!canEdit}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patch(item, { estimateHours: Number(event.target.value) })}
                />
              </td>
              <td>
                <input
                  className="cell-number"
                  type="number"
                  min={0}
                  max={999}
                  value={item.sequence}
                  disabled={!canEdit}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patch(item, { sequence: Number(event.target.value) })}
                />
              </td>
              <td>
                <button
                  className={`rush-toggle ${item.isRush ? "active" : ""}`}
                  disabled={!canEdit}
                  onClick={(event) => {
                    event.stopPropagation();
                    patch(item, { isRush: !item.isRush });
                  }}
                  title="切换插单"
                >
                  <Flame size={14} />
                  {item.isRush ? "是" : "否"}
                </button>
              </td>
              <td>{item.scheduledStart} 至 {item.scheduledEnd}</td>
              <td>
                {item.dueDate && item.dueDate < today && item.status !== "已完成" ? (
                  <span className="delay-tag overdue-tag">
                    <ArrowUpRight size={13} />
                    逾期 {item.delayedDays > 0 ? `${item.delayedDays} 工作日` : ""}
                  </span>
                ) : "无"}
              </td>
              <td>
                <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  <LinkIcon size={14} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {contextMenu && (
        <div className="row-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button disabled={!canEdit} onClick={() => { startRename(contextMenu.item); setContextMenu(null); }}>编辑</button>
          <button disabled={!canEdit || !onInsertRow} onClick={() => { onInsertRow?.(contextMenu.item, "above"); setContextMenu(null); }}>向上插入行</button>
          <button disabled={!canEdit || !onInsertRow} onClick={() => { onInsertRow?.(contextMenu.item, "below"); setContextMenu(null); }}>向下插入行</button>
          <button disabled={!onShareRow} onClick={() => { onShareRow?.(contextMenu.item); setContextMenu(null); }}>分享该数据</button>
          <button className="danger" disabled={!canEdit || !onDeleteRow} onClick={() => { onDeleteRow?.(contextMenu.item); setContextMenu(null); }}>删除该数据</button>
        </div>
      )}
    </section>
  );
}

function PersonSelect({
  value,
  fallback,
  options,
  disabled,
  onChange
}: {
  value: string;
  fallback: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const display = value || fallback || "待分配";
  const selectOptions = [...new Set([display, ...options].filter(Boolean))];

  return (
    <label className="person-cell" onClick={(event) => event.stopPropagation()}>
      <span className="avatar-dot"><UserRound size={13} /></span>
      <select value={display} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {selectOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
