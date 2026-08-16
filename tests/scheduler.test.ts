import { describe, expect, it } from "vitest";
import { isDesignWorkItem, normalizeWorkItem } from "../src/lib/normalize";
import { scheduleRequirements } from "../src/lib/scheduler";
import { addBusinessDaysIso, businessDaysBetween, isWorkingDay } from "../src/lib/date";
import { DesignRequirement, ProjectWorkItem } from "../src/types";

const baseRequirement: DesignRequirement = {
  id: "REQ-1",
  sourceId: "REQ-1",
  name: "基础需求",
  project: "测试项目",
  sourceUrl: "https://example.com",
  requester: "产品",
  productOwner: "产品",
  owner: "设计A",
  priority: "P2",
  status: "待设计",
  estimateHours: 4,
  sequence: 999,
  isRush: false,
  createdAt: "2026-08-10T00:00:00Z"
};

describe("design work item filtering", () => {
  it("keeps work items with design labels or owners", () => {
    const item: ProjectWorkItem = {
      id: "REQ-2",
      title: "结算页优化",
      url: "https://example.com",
      creator: "产品",
      assignee: "设计B",
      createdAt: "2026-08-10T00:00:00Z",
      labels: ["UI"]
    };

    expect(isDesignWorkItem(item)).toBe(true);
    expect(normalizeWorkItem(item).owner).toBe("设计B");
  });

  it("ignores non-design engineering tasks", () => {
    const item: ProjectWorkItem = {
      id: "REQ-3",
      title: "数据库索引调整",
      url: "https://example.com",
      creator: "产品",
      assignee: "后端",
      createdAt: "2026-08-10T00:00:00Z",
      labels: ["后端"]
    };

    expect(isDesignWorkItem(item)).toBe(false);
  });
});

describe("workday calendar", () => {
  it("distinguishes legal holidays from adjusted workdays", () => {
    expect(isWorkingDay("2026-10-01")).toBe(false);
    expect(isWorkingDay("2026-10-10")).toBe(true);
  });

  it("skips legal holidays when adding business days", () => {
    expect(addBusinessDaysIso("2026-09-24", 1)).toBe("2026-09-28");
    expect(businessDaysBetween("2026-09-24", "2026-09-28")).toEqual(["2026-09-24", "2026-09-28"]);
  });
});

describe("scheduleRequirements", () => {
  it("sorts by priority before due date and creation time", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "low", sourceId: "low", priority: "P3", dueDate: "2026-08-14" },
        { ...baseRequirement, id: "urgent", sourceId: "urgent", priority: "P0", dueDate: "2026-08-20" }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].sourceId).toBe("urgent");
  });

  it("keeps earlier scheduled dates ahead of later rows after refresh", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "late", sourceId: "late", startDate: "2026-09-22", sequence: 27 },
        { ...baseRequirement, id: "early", sourceId: "early", startDate: "2026-08-18", priority: "P0", sequence: 28 }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].sourceId).toBe("early");
    expect(scheduled[0].scheduledStart).toBe("2026-08-18");
  });

  it("moves same-owner work to the next available day when daily capacity is full", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "one", sourceId: "one", priority: "P1", estimateHours: 8 },
        { ...baseRequirement, id: "two", sourceId: "two", priority: "P2", estimateHours: 4 }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].scheduledStart).toBe("2026-08-13");
    expect(scheduled[1].scheduledStart).toBe("2026-08-14");
    expect(scheduled[1].overCapacity).toBe(false);
  });

  it("averages default full-day estimates across same-owner same-day requirements", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "one", sourceId: "one", estimateHours: 8, startDate: "2026-08-13" },
        { ...baseRequirement, id: "two", sourceId: "two", estimateHours: 8, startDate: "2026-08-13" }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].estimateHours).toBe(4);
    expect(scheduled[1].estimateHours).toBe(4);
    expect(scheduled[0].scheduledStart).toBe("2026-08-13");
    expect(scheduled[1].scheduledStart).toBe("2026-08-13");
  });

  it("still averages default estimates after non-estimate manual edits", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "one", sourceId: "one", estimateHours: 8, startDate: "2026-08-13", manualOverride: true, status: "已完成" },
        { ...baseRequirement, id: "two", sourceId: "two", estimateHours: 8, startDate: "2026-08-13" }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].estimateHours).toBe(4);
    expect(scheduled[1].estimateHours).toBe(4);
  });

  it("keeps explicit non-default estimates", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "one", sourceId: "one", estimateHours: 6, startDate: "2026-08-13", manualOverride: true },
        { ...baseRequirement, id: "two", sourceId: "two", estimateHours: 8, startDate: "2026-08-13" }
      ],
      "2026-08-13"
    );

    const explicit = scheduled.find((item) => item.sourceId === "one");
    expect(explicit?.estimateHours).toBe(6);
  });

  it("keeps manually edited schedule dates instead of moving them by capacity", () => {
    const scheduled = scheduleRequirements(
      [
        { ...baseRequirement, id: "one", sourceId: "one", estimateHours: 8, startDate: "2026-08-18" },
        {
          ...baseRequirement,
          id: "manual",
          sourceId: "manual",
          estimateHours: 4,
          manualOverride: true,
          startDate: "2026-08-18",
          dueDate: "2026-08-20",
          sequence: 2
        }
      ],
      "2026-08-13"
    );

    const manual = scheduled.find((item) => item.sourceId === "manual");
    expect(manual?.scheduledStart).toBe("2026-08-18");
    expect(manual?.scheduledEnd).toBe("2026-08-20");
    expect(manual?.estimateHours).toBe(20);
  });

  it("only marks delay after the scheduled end has actually passed", () => {
    const scheduled = scheduleRequirements(
      [
        {
          ...baseRequirement,
          id: "future",
          sourceId: "future",
          estimateHours: 16,
          manualOverride: true,
          startDate: "2026-08-13",
          dueDate: "2026-08-20"
        }
      ],
      "2026-08-13"
    );

    expect(scheduled[0].scheduledEnd).toBe("2026-08-20");
    expect(scheduled[0].delayedDays).toBe(0);
    expect(scheduled[0].delayReason).toBe("");
  });

  it("does not mark overdue when the scheduled end is still in the future", () => {
    const scheduled = scheduleRequirements(
      [
        {
          ...baseRequirement,
          id: "future-schedule",
          sourceId: "future-schedule",
          estimateHours: 4,
          startDate: "2026-09-02",
          dueDate: "2026-08-03"
        }
      ],
      "2026-08-16"
    );

    expect(scheduled[0].scheduledEnd).toBe("2026-09-02");
    expect(scheduled[0].delayedDays).toBe(0);
    expect(scheduled[0].delayReason).toBe("");
  });

  it("puts missing owners into the unassigned lane", () => {
    const scheduled = scheduleRequirements([{ ...baseRequirement, owner: "" }], "2026-08-13");

    expect(scheduled[0].ownerLane).toBe("待分配");
    expect(scheduled[0].unassigned).toBe(true);
  });
});
