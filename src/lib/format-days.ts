const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun display order
const LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/**
 * Compresses a days-of-week set into ranges: "Mon–Fri", "Mon–Wed Sat",
 * "Every day". Runs shorter than 3 days stay spelled out ("Sat Sun").
 */
export function formatDays(days: number[]): string {
  const ordered = ORDER.filter((d) => days.includes(d));
  if (ordered.length === 7) return "Every day";
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
        ? `${LABELS[run[0]]}–${LABELS[run[run.length - 1]]}`
        : run.map((d) => LABELS[d]).join(" "),
    )
    .join(" ");
}
