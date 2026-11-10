// Date helpers for the Timeline: "Today / Yesterday / Sunday / 2 Nov" headings, grouping saves by day, and clock times.
// Written by hand (no Intl) so the output is identical in tests and on the phone.
import type { Save } from './types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayLabel(timestamp: number, now: number): { title: string; sub: string } {
  const day = startOfDay(timestamp);
  const today = startOfDay(now);
  // Rounding absorbs the 23- and 25-hour days around daylight-saving changes.
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const dayAndMonth = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
  const sub = `${WEEKDAYS[day.getDay()].slice(0, 3)} ${dayAndMonth}`;

  if (daysAgo === 0) return { title: 'Today', sub };
  if (daysAgo === 1) return { title: 'Yesterday', sub };
  if (daysAgo > 1 && daysAgo <= 6) return { title: WEEKDAYS[day.getDay()], sub };
  const year = day.getFullYear() === today.getFullYear() ? '' : ` ${day.getFullYear()}`;
  return { title: `${dayAndMonth}${year}`, sub };
}

// "6:00 PM": used for save times and for "we'll retry at ..." messages.
export function clockTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hour = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

export interface DayGroup {
  key: string;
  title: string;
  sub: string;
  saves: Save[];
}

// Expects saves already sorted newest first, which is how listTimeline returns them.
export function groupByDay(saves: Save[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const save of saves) {
    const day = startOfDay(save.lastSavedAt);
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) {
      last.saves.push(save);
    } else {
      groups.push({ key, ...dayLabel(save.lastSavedAt, now), saves: [save] });
    }
  }
  return groups;
}
