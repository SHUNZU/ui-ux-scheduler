import { DAILY_CAPACITY_HOURS } from "../lib/constants";
import { OwnerLoad } from "../types";

interface SummaryRailProps {
  loads: OwnerLoad[];
}

export function SummaryRail({ loads }: SummaryRailProps) {
  return (
    <aside className="summary-rail">
      <div className="rail-header">负责人</div>
      {loads.map((load) => {
        const percent = Math.min(120, Math.round((load.todayHours / DAILY_CAPACITY_HOURS) * 100));
        return (
          <div className="owner-row" key={load.owner}>
            <div className="owner-name">{load.owner}</div>
            <div className="load-line">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="owner-meta">
              今日 {load.todayHours}h / 总 {load.totalHours}h
              {load.blockedCount > 0 ? ` / 阻塞 ${load.blockedCount}` : ""}
              {load.rushCount > 0 ? ` / 插单 ${load.rushCount}` : ""}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
