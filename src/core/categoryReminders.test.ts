import { mergeCategoryReminders } from './categoryReminders';

describe('mergeCategoryReminders', () => {
  it('returns the event reminders untouched when the category has none', () => {
    const own = [{ value: 5, unit: 'minutes' as const }];
    expect(mergeCategoryReminders(own, undefined)).toBe(own);
    expect(mergeCategoryReminders(own, [])).toBe(own);
    expect(mergeCategoryReminders(undefined, undefined)).toBeUndefined();
  });

  it('adds category defaults to an event without reminders', () => {
    expect(
      mergeCategoryReminders(undefined, [
        { value: 1, unit: 'hours' },
        { value: 1, unit: 'days' },
      ]),
    ).toEqual([
      { value: 1, unit: 'hours' },
      { value: 1, unit: 'days' },
    ]);
  });

  it('appends only the missing defaults, keeping the event reminders first', () => {
    expect(
      mergeCategoryReminders(
        [{ value: 1, unit: 'hours' }, { value: 10, unit: 'minutes' }],
        [{ value: 1, unit: 'hours' }, { value: 1, unit: 'days' }],
      ),
    ).toEqual([
      { value: 1, unit: 'hours' },
      { value: 10, unit: 'minutes' },
      { value: 1, unit: 'days' },
    ]);
  });

  it('returns the same reference when every default is already present', () => {
    const own = [{ value: 1, unit: 'hours' as const }];
    expect(mergeCategoryReminders(own, [{ value: 1, unit: 'hours' }])).toBe(own);
  });

  it('dedupes repeated defaults within the category list itself', () => {
    expect(
      mergeCategoryReminders(undefined, [
        { value: 30, unit: 'minutes' },
        { value: 30, unit: 'minutes' },
      ]),
    ).toEqual([{ value: 30, unit: 'minutes' }]);
  });
});
