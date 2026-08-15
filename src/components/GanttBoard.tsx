import { format, parseISO } from "date-fns";
import { eachDay } from "../lib/date";
import { STATUS_COLORS } from "../lib/constants";
import { ScheduledRequirement } from "../types";

interface GanttBoardProps {
  requirements: ScheduledRequirement[];
  owners: string[];
  rangeStart: string;
  rangeEnd: string;
  onSelect: (requirement: ScheduledRequirement) => void;
}

const DAY_WIDTH = 128;
const ROW_HEIGHT = 86;

export function GanttBoard({ requirements, owners, rangeStart, rangeEnd, onSelect }: GanttBoardProps) {
  const days = eachDay(rangeStart, rangeEnd);

  return (
    <section className="gantt-wrap">
      <div className="timeline" style={{ gridTemplateColumns: `repeat(${days.length}, ${DAY_WIDTH}px)` }}>
        {days.map((day) => (
          <div className="timeline-day" key={day}>
            <span>{format(parseISO(day), "MM/dd")}</span>
            <small>{format(parseISO(day), "EEE")}</small>
          </div>
        ))}
      </div>

      <div className="gantt-body" style={{ width: days.length * DAY_WIDTH }}>
        {owners.map((owner) => {
          const laneItems = requirements.filter((item) => item.ownerLane === owner);
          return (
            <div className="lane" key={owner} style={{ height: ROW_HEIGHT }}>
              {days.map((day) => (
                <div className="lane-cell" key={`${owner}-${day}`} style={{ width: DAY_WIDTH }} />
              ))}
              {laneItems.map((item) => {
                const startIndex = Math.max(0, days.indexOf(item.scheduledStart));
                const width = Math.max(DAY_WIDTH * item.daySpan - 14, 90);
                return (
                  <button
                    key={item.id}
                    className={`task-bar ${item.overCapacity ? "is-over" : ""} ${item.unassigned ? "is-unassigned" : ""}`}
                    style={{
                      left: startIndex * DAY_WIDTH + 7,
                      width,
                      background: STATUS_COLORS[item.status],
                      top: 16 + Math.min(26, item.offsetHours * 3)
                    }}
                    onClick={() => onSelect(item)}
                    title={`${item.name} / ${item.estimateHours}h`}
                  >
                    <strong>{item.priority}</strong>
                    <span>{item.name}</span>
                    <small>{item.estimateHours}h</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
