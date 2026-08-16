import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { businessDaysBetween, eachDay, isWorkingDay, toIsoDate } from "../lib/date";
import { STATUS_COLORS } from "../lib/constants";
import { ScheduledRequirement } from "../types";

interface GanttBoardProps {
  requirements: ScheduledRequirement[];
  owners: string[];
  rangeStart: string;
  rangeEnd: string;
  scale: GanttScale;
  canEdit: boolean;
  onScaleChange: (scale: GanttScale) => void;
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
}

type GanttScale = "week" | "month" | "quarter";
type GestureMode = "move" | "start" | "end";

interface GesturePreview {
  sourceId: string;
  mode: GestureMode;
  deltaDays: number;
  start: string;
  end: string;
}

const SCALE_WIDTH = {
  week: 128,
  month: 64,
  quarter: 34
};
const ROW_HEIGHT = 86;

export function GanttBoard({ requirements, owners, rangeStart, rangeEnd, scale, canEdit, onScaleChange, onSelect, onUpdate }: GanttBoardProps) {
  const [activeGestureId, setActiveGestureId] = useState("");
  const [gesturePreview, setGesturePreview] = useState<GesturePreview | null>(null);
  const gestureRef = useRef<{ item: ScheduledRequirement; mode: GestureMode; startX: number } | null>(null);
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

  const getPreview = (item: ScheduledRequirement, mode: GestureMode, deltaDays: number): GesturePreview => {
    const nextStart = mode === "move" || mode === "start"
      ? toIsoDate(addDays(parseISO(item.scheduledStart), deltaDays))
      : item.scheduledStart;
    const nextEnd = mode === "move" || mode === "end"
      ? toIsoDate(addDays(parseISO(item.scheduledEnd), deltaDays))
      : item.scheduledEnd;
    return {
      sourceId: item.sourceId,
      mode,
      deltaDays,
      start: nextStart,
      end: nextEnd < nextStart ? nextStart : nextEnd
    };
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

  const startGesture = (event: ReactPointerEvent, item: ScheduledRequirement, mode: GestureMode) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = { item, mode, startX: event.clientX };
    setActiveGestureId(item.sourceId);
    setGesturePreview(getPreview(item, mode, 0));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const deltaDays = Math.round((moveEvent.clientX - gesture.startX) / dayWidth);
      setGesturePreview(getPreview(gesture.item, gesture.mode, deltaDays));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      setActiveGestureId("");
      setGesturePreview(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (!gesture) return;

      const deltaDays = Math.round((upEvent.clientX - gesture.startX) / dayWidth);
      if (gesture.mode === "move") updateByDelta(gesture.item, deltaDays);
      if (gesture.mode === "start") resize(gesture.item, "start", deltaDays);
      if (gesture.mode === "end") resize(gesture.item, "end", deltaDays);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <section className="gantt-wrap">
      <div className="gantt-view-switch">
        <button className={scale === "week" ? "active" : ""} onClick={() => onScaleChange("week")}>周</button>
        <button className={scale === "month" ? "active" : ""} onClick={() => onScaleChange("month")}>月</button>
        <button className={scale === "quarter" ? "active" : ""} onClick={() => onScaleChange("quarter")}>季</button>
      </div>
      <div className="timeline" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)` }}>
              {days.map((day) => (
          <div className={`timeline-day ${isWorkingDay(day) ? "" : "non-workday"}`} key={day}>
            <span>{scale === "week" ? format(parseISO(day), "MM/dd") : format(parseISO(day), "d")}</span>
            {scale !== "quarter" && <small>{isWorkingDay(day) ? (scale === "week" ? format(parseISO(day), "EEE") : format(parseISO(day), "MMM")) : "休"}</small>}
          </div>
        ))}
      </div>

      <div className="gantt-body" style={{ width: days.length * dayWidth }}>
        {owners.map((owner) => {
          const laneItems = requirements.filter((item) => item.ownerLane === owner);
          return (
            <div className="lane" key={owner} style={{ height: ROW_HEIGHT }}>
              {days.map((day) => (
                <div className={`lane-cell ${isWorkingDay(day) ? "" : "non-workday"}`} key={`${owner}-${day}`} style={{ width: dayWidth }} />
              ))}
              {laneItems.map((item) => {
                const startIndex = Math.max(0, days.indexOf(item.scheduledStart));
                const width = Math.max(dayWidth * item.daySpan - 14, scale === "week" ? 90 : 48);
                const preview = gesturePreview?.sourceId === item.sourceId ? gesturePreview : null;
                const previewStartIndex = preview ? Math.max(0, days.indexOf(preview.start)) : startIndex;
                const previewSpan = preview ? Math.max(1, differenceInCalendarDays(parseISO(preview.end), parseISO(preview.start)) + 1) : item.daySpan;
                const previewWidth = Math.max(dayWidth * previewSpan - 14, scale === "week" ? 90 : 48);
                return (
                  <div key={item.id}>
                    {preview && (
                      <>
                        {buildWorkdaySegments(item.scheduledStart, item.scheduledEnd, days).map((segment) => (
                          <div
                            key={`${item.sourceId}-ghost-${segment.start}`}
                            className="task-ghost"
                            style={{
                              left: segment.startIndex * dayWidth + 7,
                              width: Math.max(segment.daySpan * dayWidth - 14, scale === "week" ? 90 : 34),
                              top: 16 + Math.min(26, item.offsetHours * 3)
                            }}
                          />
                        ))}
                        <div
                          className={`task-preview ${preview.mode}`}
                          style={{
                            left: previewStartIndex * dayWidth + 7,
                            width: previewWidth,
                            top: 16 + Math.min(26, item.offsetHours * 3)
                          }}
                        >
                          <strong>{preview.start}</strong>
                          <span>至</span>
                          <strong>{preview.end}</strong>
                        </div>
                      </>
                    )}
                    {buildWorkdaySegments(preview?.start ?? item.scheduledStart, preview?.end ?? item.scheduledEnd, days).map((segment, segmentIndex, segments) => (
                      <button
                        key={`${item.sourceId}-${segment.start}`}
                        className={`task-bar ${segments.length > 1 ? "segmented" : ""} ${segmentIndex === 0 ? "first-segment" : ""} ${segmentIndex === segments.length - 1 ? "last-segment" : ""} ${item.overCapacity ? "is-over" : ""} ${item.unassigned ? "is-unassigned" : ""} ${activeGestureId === item.sourceId ? "is-moving" : ""}`}
                        style={{
                          left: segment.startIndex * dayWidth + 7,
                          width: Math.max(segment.daySpan * dayWidth - 14, scale === "week" ? 90 : 34),
                          background: STATUS_COLORS[item.status],
                          top: 16 + Math.min(26, item.offsetHours * 3)
                        }}
                        onClick={() => onSelect(item)}
                        onPointerDown={(event) => startGesture(event, item, "move")}
                        title={`${item.name} / ${item.estimateHours}h`}
                      >
                        {segmentIndex === 0 && (
                          <span
                            className="task-resize left"
                            onPointerDown={(event) => startGesture(event, item, "start")}
                          />
                        )}
                        <strong>{item.priority}</strong>
                        <span>{segmentIndex === 0 ? item.name : "续"}</span>
                        <small>{segmentIndex === segments.length - 1 ? `${item.estimateHours}h` : segment.end}</small>
                        {segmentIndex === segments.length - 1 && (
                          <span
                            className="task-resize right"
                            onPointerDown={(event) => startGesture(event, item, "end")}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function buildWorkdaySegments(start: string, end: string, visibleDays: string[]) {
  const visible = new Set(visibleDays);
  const workdays = businessDaysBetween(start, end).filter((day) => visible.has(day));
  const segments: Array<{ start: string; end: string; startIndex: number; daySpan: number }> = [];

  for (const day of workdays) {
    const previous = segments[segments.length - 1];
    if (previous && differenceInCalendarDays(parseISO(day), parseISO(previous.end)) === 1) {
      previous.end = day;
      previous.daySpan += 1;
    } else {
      segments.push({ start: day, end: day, startIndex: visibleDays.indexOf(day), daySpan: 1 });
    }
  }

  return segments;
}
