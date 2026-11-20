/** Google availability windows use UAE local time and exclusive ends. */
export type CalendarWindow = { date: string; startTime: string | null; endTime: string | null; timeMin: string; timeMax: string };
export type CalendarCheck = { status: "available" | "busy" | "unknown"; window: CalendarWindow; reason?: string };

export function calendarWindow(input: { date: string; startTime?: string | null; endTime?: string | null }): CalendarWindow {
  const { date } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid event date");
  const startTime = input.startTime || null, endTime = input.endTime || null;
  if ((startTime === null) !== (endTime === null)) throw new Error("Provide both start and end time");
  if ([startTime, endTime].some(t => t !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error("Invalid event time");
  const timeMin = `${date}T${startTime ?? "00:00"}:00+04:00`;
  const start = new Date(timeMin);
  let end = endTime ? new Date(`${date}T${endTime}:00+04:00`) : new Date(start.getTime() + 86400000);
  if (endTime && endTime === startTime) throw new Error("Start and end time must differ");
  if (end < start) end = new Date(end.getTime() + 86400000);
  return { date, startTime, endTime, timeMin, timeMax: end.toISOString() };
}

export function busyOverlaps(window: CalendarWindow, busy: { start: string; end: string }[]): boolean {
  return busy.some(b => Date.parse(b.start) < Date.parse(window.timeMax) && Date.parse(b.end) > Date.parse(window.timeMin));
}

export function verifiedCalendarDraft(date: string, check: CalendarCheck | undefined): boolean {
  return check?.status === "available" && check.window.date === date && check.window.startTime !== null && check.window.endTime !== null;
}
/** Unknown availability may request approval, but never confirms or reserves a slot. */
export function artistApprovalDraft(date: string, check: CalendarCheck | undefined): boolean {
  return !!check && check.status !== "busy" && check.window.date === date && check.window.startTime !== null && check.window.endTime !== null;
}
