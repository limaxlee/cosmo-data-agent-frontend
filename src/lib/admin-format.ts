/** How the admin area writes times and days. Always the admin's own time zone. */

const pad = (value: number) => String(value).padStart(2, "0");

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A time from the backend ("2026-11-23T01:15:00Z") as "2026-11-23 10:15". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return `${dayOf(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The day that is `daysBack` days before today, as "2026-11-23". */
export function dayBefore(daysBack = 0): string {
  const date = new Date();

  date.setDate(date.getDate() - daysBack);

  return dayOf(date);
}

/** "1,284": the same grouping whatever language the browser is set to. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
