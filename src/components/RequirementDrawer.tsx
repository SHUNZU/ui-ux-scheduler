import { ExternalLink, X } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../lib/constants";
import { todayIso } from "../lib/date";
import { ScheduledRequirement } from "../types";

interface RequirementDrawerProps {
  requirement: ScheduledRequirement | null;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
}

export function RequirementDrawer({ requirement, canEdit, onClose, onUpdate }: RequirementDrawerProps) {
  if (!requirement) return null;
  const today = todayIso();
  const isOverdue = Boolean(requirement.dueDate && requirement.dueDate < today && requirement.status !== "已完成");
  const scheduleImpact = isOverdue
    ? `逾期${requirement.delayedDays > 0 ? ` ${requirement.delayedDays} 个工作日` : ""}`
    : "无影响";

  const patch = (partial: Partial<ScheduledRequirement>) => {
    if (!canEdit) return;
    onUpdate({ ...requirement, ...partial, manualOverride: true });
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
        <div className="drawer-head">
          <span className="priority-pill">{requirement.priority}</span>
          <h2>{requirement.name}</h2>
          <span className={`drawer-mode ${canEdit ? "edit" : "readonly"}`}>{canEdit ? "可编辑" : "只读"}</span>
          <a href={requirement.sourceUrl} target="_blank" rel="noreferrer">
            打开来源 <ExternalLink size={14} />
          </a>
        </div>

        <div className="form-grid">
          <label className="wide-label">
            需求名称
            <input value={requirement.name} disabled={!canEdit} onChange={(event) => patch({ name: event.target.value })} />
          </label>
          <label>
            设计负责人
            <input value={requirement.owner} disabled={!canEdit} onChange={(event) => patch({ owner: event.target.value })} />
          </label>
          <label>
            产品负责人
            <input
              value={requirement.productOwner || requirement.requester}
              disabled={!canEdit}
              onChange={(event) => patch({ productOwner: event.target.value, requester: event.target.value })}
            />
          </label>
          <label>
            状态
            <select value={requirement.status} disabled={!canEdit} onChange={(event) => patch({ status: event.target.value as ScheduledRequirement["status"] })}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            优先级
            <select value={requirement.priority} disabled={!canEdit} onChange={(event) => patch({ priority: event.target.value as ScheduledRequirement["priority"] })}>
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
          <label>
            预计设计工时
            <input
              type="number"
              min={1}
              max={80}
              value={requirement.estimateHours}
              disabled={!canEdit}
              onChange={(event) => patch({ estimateHours: Number(event.target.value) })}
            />
          </label>
          <label>
            排期顺序
            <input
              type="number"
              min={0}
              max={999}
              value={requirement.sequence}
              disabled={!canEdit}
              onChange={(event) => patch({ sequence: Number(event.target.value) })}
            />
          </label>
          <label>
            开始日期
            <input type="date" value={requirement.startDate ?? requirement.scheduledStart} disabled={!canEdit} onChange={(event) => patch({ startDate: event.target.value })} />
          </label>
          <label>
            截止日期
            <input type="date" value={requirement.dueDate ?? ""} disabled={!canEdit} onChange={(event) => patch({ dueDate: event.target.value })} />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={requirement.isRush}
              disabled={!canEdit}
              onChange={(event) => patch({ isRush: event.target.checked })}
            />
            插单
          </label>
        </div>

        <label className="stacked-label">
          插单原因
          <textarea value={requirement.rushReason ?? ""} disabled={!canEdit} onChange={(event) => patch({ rushReason: event.target.value })} />
        </label>
        <label className="stacked-label">
          阻塞原因
          <textarea value={requirement.blockedReason ?? ""} disabled={!canEdit} onChange={(event) => patch({ blockedReason: event.target.value })} />
        </label>
        <label className="stacked-label">
          备注
          <textarea value={requirement.note ?? ""} disabled={!canEdit} onChange={(event) => patch({ note: event.target.value })} />
        </label>

        <dl className="detail-list">
          <div><dt>产品负责人</dt><dd>{requirement.productOwner || requirement.requester}</dd></div>
          <div><dt>所属项目</dt><dd>{requirement.project}</dd></div>
          <div><dt>来源 ID</dt><dd>{requirement.sourceId}</dd></div>
          <div><dt>自动排期</dt><dd>{requirement.scheduledStart} 至 {requirement.scheduledEnd}</dd></div>
          <div><dt>排期影响</dt><dd>{scheduleImpact}</dd></div>
          <div><dt>同步时间</dt><dd>{requirement.syncedAt ? new Date(requirement.syncedAt).toLocaleString() : "本地数据"}</dd></div>
        </dl>
      </aside>
    </div>
  );
}
