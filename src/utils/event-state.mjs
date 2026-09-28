// Calendar fields use Beijing time, independent of the build machine's timezone.
export function eventDay(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
}
export function eventEnd(data) {
  const day = eventDay(data.date);
  const text = String(data.time || '').replace(/：/g, ':');
  const range = text.match(/(\d{1,2}):([0-5]\d)\s*[–—\-~～至到]\s*(\d{1,2}):([0-5]\d)/);
  if (range && Number(range[1]) < 24 && Number(range[3]) < 24) {
    const start = Number(range[1]) * 60 + Number(range[2]);
    const end = Number(range[3]) * 60 + Number(range[4]);
    // A reversed/ambiguous range is not evidence that the event finished early.
    if (end > start) return Date.parse(`${day}T${range[3].padStart(2, '0')}:${range[4]}:00+08:00`);
  }
  // Unknown or start-only time: keep visible through the entire calendar day.
  return Date.parse(`${day}T00:00:00+08:00`) + 86400000;
}
export function isPastEvent(data, now = new Date()) {
  return data.status === '已结束' || Number(now) >= eventEnd(data);
}
export function effectiveStatus(data, now = new Date()) {
  return data.status === '已公布' && isPastEvent(data, now) ? '已结束' : data.status;
}
