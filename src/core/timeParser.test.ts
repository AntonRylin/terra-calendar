import { parseQuickEntry } from './timeParser';

describe('parseQuickEntry', () => {
  it('parses leading "HH MM" as time, rest as title', () => {
    expect(parseQuickEntry('14 30 Dentist appointment')).toEqual({
      time: '14:30',
      endTime: null,
      title: 'Dentist appointment',
    });
  });

  it('parses "H MM" and zero-pads the hour', () => {
    expect(parseQuickEntry('9 00 Standup')).toEqual({
      time: '09:00',
      endTime: null,
      title: 'Standup',
    });
  });

  it('parses early-morning times like "04 12"', () => {
    expect(parseQuickEntry('04 12 Call mom')).toEqual({
      time: '04:12',
      endTime: null,
      title: 'Call mom',
    });
  });

  it('also accepts a colon separator', () => {
    expect(parseQuickEntry('14:30 Dentist')).toEqual({
      time: '14:30',
      endTime: null,
      title: 'Dentist',
    });
  });

  it('parses 4-digit military format like "1230 Dentist"', () => {
    expect(parseQuickEntry('1230 Dentist')).toEqual({
      time: '12:30',
      endTime: null,
      title: 'Dentist',
    });
    expect(parseQuickEntry('0900 Meeting')).toEqual({
      time: '09:00',
      endTime: null,
      title: 'Meeting',
    });
  });

  it('parses times directly with no space before the title', () => {
    expect(parseQuickEntry('12:30Dentist')).toEqual({
      time: '12:30',
      endTime: null,
      title: 'Dentist',
    });
    expect(parseQuickEntry('1230Dentist')).toEqual({
      time: '12:30',
      endTime: null,
      title: 'Dentist',
    });
  });

  it('parses times directly with no title', () => {
    expect(parseQuickEntry('12:30')).toEqual({
      time: '12:30',
      endTime: null,
      title: '',
    });
    expect(parseQuickEntry('1230')).toEqual({
      time: '12:30',
      endTime: null,
      title: '',
    });
  });

  it('does not parse larger numbers as time', () => {
    expect(parseQuickEntry('12345 Dentist')).toEqual({
      time: null,
      endTime: null,
      title: '12345 Dentist',
    });
    expect(parseQuickEntry('12305')).toEqual({
      time: null,
      endTime: null,
      title: '12305',
    });
  });

  it('treats text without a time as an all-day title', () => {
    expect(parseQuickEntry('Buy flowers')).toEqual({
      time: null,
      endTime: null,
      title: 'Buy flowers',
    });
  });

  it('rejects invalid clock values and keeps them in the title', () => {
    expect(parseQuickEntry('25 99 nope')).toEqual({
      time: null,
      endTime: null,
      title: '25 99 nope',
    });
    expect(parseQuickEntry('2599 nope')).toEqual({
      time: null,
      endTime: null,
      title: '2599 nope',
    });
  });

  it('requires the minutes to be two digits', () => {
    expect(parseQuickEntry('12 5 groceries')).toEqual({
      time: null,
      endTime: null,
      title: '12 5 groceries',
    });
  });

  it('handles time with no title', () => {
    expect(parseQuickEntry('14 30')).toEqual({
      time: '14:30',
      endTime: null,
      title: '',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseQuickEntry('  14 30  Dentist ')).toEqual({
      time: '14:30',
      endTime: null,
      title: 'Dentist',
    });
  });

  it('handles empty input', () => {
    expect(parseQuickEntry('')).toEqual({
      time: null,
      endTime: null,
      title: '',
    });
  });

  // NEW TESTS FOR END TIME PARSING:
  it('parses start and end times separated by space', () => {
    expect(parseQuickEntry('12 30 13 45 teamevent')).toEqual({
      time: '12:30',
      endTime: '13:45',
      title: 'teamevent',
    });
  });

  it('parses 8-digit continuous start and end times', () => {
    expect(parseQuickEntry('05002015 famiyl dinner')).toEqual({
      time: '05:00',
      endTime: '20:15',
      title: 'famiyl dinner',
    });
  });

  it('parses start and end times with hyphens and colons', () => {
    expect(parseQuickEntry('12:30-13:45 dentist')).toEqual({
      time: '12:30',
      endTime: '13:45',
      title: 'dentist',
    });
  });

  it('parses start and end times with "to"', () => {
    expect(parseQuickEntry('1230 to 1345 dentist')).toEqual({
      time: '12:30',
      endTime: '13:45',
      title: 'dentist',
    });
  });
});
