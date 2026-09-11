import type { CollectionEntry } from 'astro:content';

export type EventEntry = CollectionEntry<'events'>;

export function sortEventsAsc(events: EventEntry[]) {
  return [...events].sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}

export function findNextEvent(events: EventEntry[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return sortEventsAsc(events).find((event) =>
    event.data.status !== '已结束' && event.data.date.getTime() >= today
  );
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Shanghai',
    ...options
  }).format(date);
}
