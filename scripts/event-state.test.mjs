import test from 'node:test';
import assert from 'node:assert/strict';
import { isPastEvent, effectiveStatus, eventEnd } from '../src/utils/event-state.mjs';
import { updateStatus } from './update-event-status.mjs';
const event = { date: '2026-09-16', time: '09:30–11:50', status: '已公布' };
test('announced event remains upcoming before and during the session, ends at Beijing end time', () => {
  for (const now of ['2026-09-15T23:00:00Z', '2026-09-16T03:49:59Z']) {
    assert.equal(isPastEvent(event, new Date(now)), false);
    assert.equal(effectiveStatus(event, new Date(now)), '已公布');
  }
  assert.equal(effectiveStatus(event, new Date('2026-09-16T03:50:00Z')), '已结束');
});
test('all statuses belong to exactly one list, including overdue pending and manually ended future events', () => {
  for (const status of ['待定', '已公布', '已结束']) for (const date of ['2026-01-01', '2027-01-01']) {
    const d = { ...event, date, status }, now = new Date('2026-09-28T00:00:00Z');
    assert.equal(Number(isPastEvent(d, now)) + Number(!isPastEvent(d, now)), 1);
  }
  assert.equal(effectiveStatus({ ...event, status: '待定' }, new Date('2026-09-28')), '待定');
});
test('Date objects, delimiters and missing end times use timezone-independent rules', () => {
  assert.equal(eventEnd({ ...event, date: new Date('2026-09-16') }), eventEnd(event));
  for (const time of ['9:30-11:50', '09：30—11：50', '9:30 至 11:50']) assert.equal(eventEnd({ ...event, time }), eventEnd(event));
  for (const time of ['待定', '09:30', '99:30–11:50', '11:50–09:30']) {
    const d = { ...event, time };
    assert.equal(isPastEvent(d, new Date('2026-09-16T15:59:59Z')), false);
    assert.equal(isPastEvent(d, new Date('2026-09-16T16:00:00Z')), true);
  }
});
test('normalization changes only expired announced status, is idempotent and preserves CRLF and full body', () => {
  const before = '---\r\nissue: 10\r\ndate: 2026-09-16\r\ntime: "09:30–11:50"\r\nstatus: "已公布" # comment\r\nsummary: 完整摘要\r\ntags: [MHD]\r\n---\r\n原始正文\r\nstatus: 已公布\r\n';
  const now = new Date('2026-09-28'), after = updateStatus(before, now);
  assert.equal(after, before.replace('status: "已公布"', 'status: "已结束"'));
  assert.equal(updateStatus(after, now), after);
  assert.equal(updateStatus(before, new Date('2026-09-15')), before);
  assert.equal(updateStatus(before.replace('"已公布"', '"待定"'), now), before.replace('"已公布"', '"待定"'));
});
