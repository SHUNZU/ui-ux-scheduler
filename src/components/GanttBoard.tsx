import { useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { eachDay, toIsoDate } from "../lib/date";
import { STATUS_COLORS } from "../lib/constants";
import { ScheduledRequirement } from "../types";

interface GanttBoardProps {
  requirements: ScheduledRequirement[];
  owners: string[];
  rangeStart: string;
  rangeEnd: string;
  scale: "week" | "quarter";
  canEdit: boolean;
  onScaleChange: (scale: "week" | "quarter") => void;
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
}

const SCALE_WIDTH = {
  week: 128,
  quarter: 34
};
const ROW_HEIGHT = 86;

export function GanttBoard({ requirements, owners, rangeStart, rangeEnd, scale, canEdit, onScaleChange, onSelect, onUpdate }: GanttBoardProps) {
  const [dragStartX, setDragStartX] = useState(0);
  const days = eachDay(rangeStart, rangeEnd);
  const dayWidth = SCALE_WIDTH[scale];

  const updateByDelta = (item: ScheduledRequirement, deltaDays: number) => {
    if (!canEdit || deltaDays === 0) return;
    onUpdate({
      ...item,
      startDate: toIsoDate(addDays(parseISO(item.scheduledStart), deltaDays)),
      dueDate: toIsoDate(addDays(parseISO(item.scheduledEnd), deltaDays)),
      manualOverride: true
    });
  };

  const resize = (item: ScheduledRequirement, edge: "start" | "end", deltaDays: number) => {
    if (!canEdit || deltaDays === 0) return;
    const nextStart = edge === "start" ? toIsoDate(addDays(parseISO(item.scheduledStart), deltaDays)) : item.scheduledStart;
    const nextEnd = edge === "end" ? toIsoDate(addDays(parseISO(item.scheduledEnd), deltaDays)) : item.scheduledEnd;
    if (nextEnd < nextStart) return;
    const daySpan = Math.max(1, differenceInCalendarDays(parseISO(nextEnd), parseISO(nextStart)) + 1);
    onUpdate({
      ...item,
      startDate: nextStart,
      dueDate: nextEnd,
      estimateHours: Math.max(1, daySpan * 8),
      manualOverride: true
    });
  };

  return (
    <section className="gantt-wrap">
      <div className="gantt-view-switch">
        <button className={scale === "week" ? "active" : ""} onClick={() => onScaleChange("week")}>周</button>
        <button className={scale === "quarter" ? "active" : ""} onClick={() => onScaleChange("quarter")}>季</button>
      </div>
      <div className="timeline" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)` }}>
        {days.map((day) => (
          <div className="timeline-day" key={day}>
            <span>{scale === "week" ? format(parseISO(day), "MM/dd") : format(parseISO(day), "M/d")}</span>
            {scale === "week" && <small>{format(parseISO(day), "EEE")}</small>}
          </div>
        ))}
      </div>

      <div className="gantt-body" style={{ width: days.length * dayWidth }}>
        {owners.map((owner) => {
          const laneItems = requirements.filter((item) => item.ownerLane === owner);
          return (
            <div className="lane" key={owner} style={{ height: ROW_HEIGHT }}>
              {days.map((day) => (
                <div className="lane-cell" key={`${owner}-${day}`} style={{ width: dayWidth }} />
              ))}
              {laneItems.map((item) => {
                const startIndex = Math.max(0, days.indexOf(item.scheduledStart));
                const width = Math.max(dayWidth * item.daySpan - 14, scale === "week" ? 90 : 48);
                return (
                  <button
                    key={item.id}
                    className={`task-bar ${item.overCapacity ? "is-over" : ""} ${item.unassigned ? "is-unassigned" : ""}`}
                    style={{
                      left: startIndex * dayWidth + 7,
                      width,
                      background: STATUS_COLORS[item.status],
                      top: 16 + Math.min(26, item.offsetHours * 3)
                    }}
                    onClick={() => onSelect(item)}
                    draggable={canEdit}
                    onDragStart={(event) => {
                      setDragStartX(event.clientX);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => event.preventDefault()}
                    onDragEnd={(event) => {
                      const deltaPixels = event.clientX - dragStartX;
                      const deltaDays = Math.round(deltaPixels / dayWidth);
                      updateByDelta(item, deltaDays);
                    }}
                    title={`${item.name} / ${item.estimateHours}h`}
                  >
                    <span
                      className="task-resize left"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        const startX = event.clientX;
                        const onUp = (upEvent: PointerEvent) => {
                          resize(item, "start", Math.round((upEvent.clientX - startX) / dayWidth));
                          window.removeEventListener("pointerup", onUp);
                        };
                        window.addEventListener("pointerup", onUp);
                      }}
                    />
                    <strong>{item.priority}</strong>
                    <span>{item.name}</span>
                    <small>{item.estimateHours}h</small>
                    <span
                      className="task-resize right"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        const startX = event.clientX;
                        const onUp = (upEvent: PointerEvent) => {
                          resize(item, "end", Math.round((upEvent.clientX - startX) / dayWidth));
                          window.removeEventListener("pointerup", onUp);
                        };
                        window.addEventListener("pointerup", onUp);
                      }}
                    />
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
