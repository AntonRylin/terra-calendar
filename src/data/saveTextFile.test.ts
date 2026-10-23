import { saveTextFile } from './saveTextFile';

const OPTS = { defaultName: 'settings.json', contents: '{"a":1}' };

describe('saveTextFile', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    vi.restoreAllMocks();
  });

  it('writes through the browser save picker and reports the chosen file', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const picker = vi.fn().mockResolvedValue({
      name: 'my-settings.json',
      createWritable: async () => ({ write, close }),
    });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = picker;

    const result = await saveTextFile(OPTS);

    expect(result).toEqual({ status: 'saved', path: 'my-settings.json' });
    expect(write).toHaveBeenCalledWith('{"a":1}');
    expect(close).toHaveBeenCalled();
    expect(picker.mock.calls[0][0].suggestedName).toBe('settings.json');
  });

  it('reports a dismissed picker as cancelled, not as an error', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    await expect(saveTextFile(OPTS)).resolves.toEqual({ status: 'cancelled' });
  });

  it('falls back to a download when no picker exists', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();

    const result = await saveTextFile(OPTS);

    expect(result).toEqual({ status: 'downloaded', name: 'settings.json' });
    expect(click).toHaveBeenCalled();
  });

  it('falls back to a download when the picker is blocked', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('blocked', 'SecurityError'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();

    await expect(saveTextFile(OPTS)).resolves.toEqual({ status: 'downloaded', name: 'settings.json' });
    expect(click).toHaveBeenCalled();
  });
});
