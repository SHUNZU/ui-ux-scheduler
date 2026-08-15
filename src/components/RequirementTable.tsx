import { ArrowUpRight, Flame, Link as LinkIcon, UserRound } from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_COLORS, STATUS_OPTIONS } from "../lib/constants";
import { RequirementPriority, RequirementStatus, ScheduledRequirement } from "../types";

interface RequirementTableProps {
  requirements: ScheduledRequirement[];
  designOwners: string[];
  productOwners: string[];
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
}

export function RequirementTable({
  requirements,
  designOwners,
  productOwners,
  onSelect,
  onUpdate
}: RequirementTableProps) {
  const patch = (item: ScheduledRequirement, partial: Partial<ScheduledRequirement>) => {
    onUpdate({ ...item, ...partial, manualOverride: true });
  };

  return (
    <section className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
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
          {requirements.map((item) => (
            <tr key={item.sourceId} onClick={() => onSelect(item)}>
              <td>
                <div className="name-cell">
                  {item.isRush && <Flame size={14} />}
                  <span>{item.name}</span>
                </div>
              </td>
              <td>{item.project}</td>
              <td>
                <PersonSelect
                  value={item.owner}
                  fallback={item.ownerLane}
                  options={designOwners}
                  onChange={(owner) => patch(item, { owner })}
                />
              </td>
              <td>
                <PersonSelect
                  value={item.productOwner}
                  fallback={item.requester}
                  options={productOwners}
                  onChange={(productOwner) => patch(item, { productOwner, requester: productOwner })}
                />
              </td>
              <td>
                <select
                  className={`cell-select priority-cell priority-${item.priority.toLowerCase()}`}
                  value={item.priority}
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
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patch(item, { sequence: Number(event.target.value) })}
                />
              </td>
              <td>
                <button
                  className={`rush-toggle ${item.isRush ? "active" : ""}`}
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
                {item.delayedDays > 0 ? (
                  <span className="delay-tag">
                    <ArrowUpRight size={13} />
                    {item.delayedDays} 工作日
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
    </section>
  );
}

function PersonSelect({
  value,
  fallback,
  options,
  onChange
}: {
  value: string;
  fallback: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const display = value || fallback || "待分配";
  const selectOptions = [...new Set([display, ...options].filter(Boolean))];

  return (
    <label className="person-cell" onClick={(event) => event.stopPropagation()}>
      <span className="avatar-dot"><UserRound size={13} /></span>
      <select value={display} onChange={(event) => onChange(event.target.value)}>
        {selectOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
