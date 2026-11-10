// Tests for the timeline's day labels, day grouping and clock formatting (src/core/dates.ts).
// Pure functions, so they run in Node with a fixed "now" instead of the real clock.
import { clockTime, dayLabel, groupByDay, lastSaveLabel, savedAtLabel } from '@/core/dates';
import type { Save } from '@/core/types';

const now = new Date(2026, 10, 10, 21, 0).getTime(); // Tue 10 Nov 2026, 9 PM local
const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) => new Date(year, month, day, hour, minute).getTime();

describe('dayLabel', () => {
  it('names today and yesterday', () => {
    expect(dayLabel(at(10, 10, 8), now)).toEqual({ title: 'Today', sub: 'Tue 10 Nov' });
    expect(dayLabel(at(10, 9, 23, 59), now)).toEqual({ title: 'Yesterday', sub: 'Mon 9 Nov' });
  });

  it('uses the weekday name within the last six days', () => {
    expect(dayLabel(at(10, 5), now)).toEqual({ title: 'Thursday', sub: 'Thu 5 Nov' });
  });

  it('uses the date for older saves, with the year only when it differs', () => {
    expect(dayLabel(at(9, 1), now)).toEqual({ title: '1 Oct', sub: 'Thu 1 Oct' });
    expect(dayLabel(at(11, 25, 12, 0, 2025), now)).toEqual({ title: '25 Dec 2025', sub: 'Thu 25 Dec' });
  });
});

describe('clockTime', () => {
  it('formats as h:mm AM/PM', () => {
    expect(clockTime(at(10, 10, 18, 0))).toBe('6:00 PM');
    expect(clockTime(at(10, 10, 0, 5))).toBe('12:05 AM');
    expect(clockTime(at(10, 10, 12, 30))).toBe('12:30 PM');
  });
});

describe('groupByDay', () => {
  it('groups saves by local calendar day, keeping the given order', () => {
    const saves = [{ id: 1, lastSavedAt: at(10, 10, 20) }, { id: 2, lastSavedAt: at(10, 10, 9) }, { id: 3, lastSavedAt: at(10, 9, 22) }] as Save[];
    const groups = groupByDay(saves, now);
    expect(groups.map((group) => [group.title, group.saves.map((save) => save.id)])).toEqual([
      ['Today', [1, 2]],
      ['Yesterday', [3]],
    ]);
    expect(groups[0].key).toBe('2026-11-10');
  });
});

describe('savedAtLabel', () => {
  it('reads like "yesterday, 11:42 PM"', () => {
    const now = at(10, 10, 9, 0);
    expect(savedAtLabel(at(10, 9, 23, 42), now)).toBe('yesterday, 11:42 PM');
    expect(savedAtLabel(at(10, 10, 6, 0), now)).toBe('today, 6:00 AM');
    expect(savedAtLabel(at(10, 4, 18, 0), now)).toBe('Wednesday, 6:00 PM');
  });
});

describe('lastSaveLabel', () => {
  it('reads like "yesterday at 11:42 PM"', () => {
    const now = at(10, 10, 9, 0);
    expect(lastSaveLabel(at(10, 9, 23, 42), now)).toBe('yesterday at 11:42 PM');
    expect(lastSaveLabel(at(10, 4, 18, 0), now)).toBe('Wednesday at 6:00 PM');
  });
});
