import { describe, expect, it } from "vitest";
import { formatDays } from "@/lib/format-days";

describe("formatDays", () => {
  it("compresses runs of three or more into ranges", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDays([1, 2, 3, 6])).toBe("Mon–Wed Sat");
  });

  it("spells out short runs", () => {
    expect(formatDays([6, 0])).toBe("Sat Sun");
    expect(formatDays([1, 3, 5])).toBe("Mon Wed Fri");
  });

  it("labels the full week", () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("sorts into Mon..Sun display order regardless of input order", () => {
    expect(formatDays([0, 5, 1, 4, 3, 2])).toBe("Mon–Fri Sun");
  });

  it("returns empty for no days", () => {
    expect(formatDays([])).toBe("");
  });
});
