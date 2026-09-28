import type { CollectionEntry } from 'astro:content';
import { isPastEvent, effectiveStatus } from './event-state.mjs';
export { isPastEvent, effectiveStatus };

export type EventEntry = CollectionEntry<'events'>;

export function sortEventsAsc(events: EventEntry[]) {
  return [...events].sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}

export function findNextEvent(events: EventEntry[], now = new Date()) {
  return sortEventsAsc(events).find((event) =>
    !isPastEvent(event.data, now)
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
