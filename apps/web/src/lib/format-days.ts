const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun display order

/** Day names indexed by JS weekday (0 = Sunday), plus the all-week phrase. */
export type DayLabels = { short: readonly string[]; everyDay: string };

const EN: DayLabels = {
  short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  everyDay: "Every day",
};

/**
 * Compresses a days-of-week set into ranges: "Mon–Fri", "Mon–Wed Sat",
 * "Every day". Runs shorter than 3 days stay spelled out ("Sat Sun").
 */
export function formatDays(days: number[], labels: DayLabels = EN): string {
  const ordered = ORDER.filter((d) => days.includes(d));
  if (ordered.length === 7) return labels.everyDay;
  if (ordered.length === 0) return "";

  const runs: number[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    if (last && ORDER.indexOf(day) === ORDER.indexOf(last[last.length - 1]) + 1) {
      last.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs
    .map((run) =>
      run.length >= 3
        ? `${labels.short[run[0]]}–${labels.short[run[run.length - 1]]}`
        : run.map((d) => labels.short[d]).join(" "),
    )
    .join(" ");
}
