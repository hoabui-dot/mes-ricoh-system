import React from 'react';
import { Input } from './ui';

const parts = (value: Date, timeZone: string) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}:${values.second}` };
};

function offsetMinutes(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
  const name = formatter.formatToParts(value).find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

export function siteDateTimeToIso(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return '';
  const localAsUtc = Date.parse(`${date}T${time}Z`);
  if (!Number.isFinite(localAsUtc)) return '';
  const initial = new Date(localAsUtc);
  const corrected = new Date(localAsUtc - offsetMinutes(initial, timeZone) * 60_000);
  return corrected.toISOString();
}

export function isoToSiteDateTime(value: string | undefined, timeZone: string) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return parts(new Date(), timeZone);
  return parts(parsed, timeZone);
}

export function EffectiveDateTimePicker({ date, time, timeZone, onDateChange, onTimeChange, labels }: {
  date: string;
  time: string;
  timeZone: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  labels: { date: string; time: string };
}) {
  return <div className="grid gap-3 rounded-md border border-border bg-surface-subtle p-4 sm:grid-cols-2">
    <label className="block space-y-1 text-sm"><span className="font-medium">{labels.date}</span><Input type="date" required value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">{labels.time}</span><Input type="time" step="1" required value={time} onChange={(event) => onTimeChange(event.target.value.length === 5 ? `${event.target.value}:00` : event.target.value)} /></label>
  </div>;
}
