import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayBackgroundHost } from './DayBackgroundHost';
import { useUiStore } from '../../app/uiStore';
import { useSpecialDaysStore } from '../../app/specialDaysStore';

const processMedia = vi.fn(async (_source: Blob, _opts?: { maxSeconds?: number }) => ({
  blob: new Blob([new Uint8Array(240 * 1024)], { type: 'video/webm' }),
  w: 480, h: 270, mime: 'video/webm', media: 'video' as const,
}));

vi.mock('./imageImport', () => ({
  processMedia: (source: Blob, opts?: { maxSeconds?: number }) => processMedia(source, opts),
  blobFromUrl: vi.fn(),
  probeMediaUrl: vi.fn(),
  mediaFileFromDataTransfer: () => null,
}));

// jsdom has no MediaRecorder, which would otherwise put the studio into its
// "this browser can't shrink video" fallback copy.
vi.mock('./videoImport', () => ({
  canTranscodeMotion: () => true,
  CLIP_CHOICES: [3, 6, 10],
  DEFAULT_CLIP_SEC: 6,
}));

vi.mock('../../data/dayImageStore', () => ({
  putImage: vi.fn(async (_b: Blob, w: number, h: number) => ({ id: 'media-1', w, h })),
  getImageUrl: vi.fn(async () => 'blob:clip'),
}));
vi.mock('../../data/cloudDayImages', () => ({ uploadDayImage: vi.fn() }));
vi.mock('../../data/createRepository', () => ({ isCloudMode: () => false }));

const DATE = '2026-01-05';

function openStudio() {
  useUiStore.getState().openDayBackground(DATE);
  return render(<DayBackgroundHost />);
}

/** Everything the modal is currently showing, as text. */
const modalText = () => document.querySelector('.dbg-modal')?.textContent ?? '';

describe('day background studio — the method chooser', () => {
  beforeEach(() => {
    useSpecialDaysStore.setState({ specialDays: [] });
    processMedia.mockClear();
  });

  it('offers the everyday methods first and keeps Custom CSS under Advanced', () => {
    openStudio();
    expect(screen.getByRole('button', { name: /Scenes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Photo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Video & GIF/ })).toBeInTheDocument();

    const advanced = document.querySelector('.dbg-advanced')!;
    expect(within(advanced as HTMLElement).getByRole('button', { name: /Custom CSS/ })).toBeInTheDocument();
  });
});

describe('day background studio — one step at a time', () => {
  beforeEach(() => {
    useSpecialDaysStore.setState({ specialDays: [] });
    processMedia.mockClear();
  });

  it('opens the clip view on the drop zone alone — no link field, no clip length', async () => {
    const user = userEvent.setup();
    openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));

    expect(screen.getByText(/Drop a video or GIF here|Choose a video or GIF/)).toBeInTheDocument();
    // The two questions that only matter later are not asked yet.
    expect(screen.queryByText(/Clip length/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/https/)).not.toBeInTheDocument();
  });

  it('swaps the drop zone for the link field, and back again', async () => {
    const user = userEvent.setup();
    openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));
    await user.click(screen.getByRole('button', { name: /Use a clip from the web/ }));

    expect(screen.getByPlaceholderText(/https/)).toBeInTheDocument();
    // Asking for a link means the file target is gone — one way in at a time.
    expect(screen.queryByText(/Drop a video or GIF here|Choose a video or GIF/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trimmed, muted and shrunk/)).not.toBeInTheDocument();
    // Saving a copy is the default; keeping a live link is the opt-in.
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText(/https/)).not.toBeInTheDocument();
    expect(screen.getByText(/Drop a video or GIF here|Choose a video or GIF/)).toBeInTheDocument();
  });

  it('drops the picking UI once a clip lands, and reports what was saved', async () => {
    const user = userEvent.setup();
    const { container } = openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));

    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['clip'], 'holiday.mp4', { type: 'video/mp4' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument());
    expect(modalText()).toMatch(/6s clip · 240 KB · loops silently/);
    // The screen shrinks to the result: no drop zone, no hint, no link opener.
    expect(screen.queryByText(/Drop a video or GIF here|Choose a video or GIF/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use a clip from the web/ })).not.toBeInTheDocument();
    // The one adjustment still worth offering stays.
    expect(screen.getByText(/Clip length/i)).toBeInTheDocument();
  });

  it('goes back to picking on Replace', async () => {
    const user = userEvent.setup();
    const { container } = openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['clip'], 'holiday.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Replace' }));

    expect(screen.getByText(/Drop a video or GIF here|Choose a video or GIF/)).toBeInTheDocument();
    expect(screen.queryByText(/Clip length/i)).not.toBeInTheDocument();
  });

  it('re-cuts the clip from the same file when the length changes', async () => {
    const user = userEvent.setup();
    const { container } = openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['clip'], 'holiday.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(screen.getByText(/Clip length/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '3s' }));

    // Second pass over the original file — the user is never asked to pick it again.
    await waitFor(() => expect(processMedia).toHaveBeenCalledTimes(2));
    expect(processMedia.mock.calls[1][1]).toMatchObject({ maxSeconds: 3 });
  });
});

describe('day background studio — plain-language surface', () => {
  beforeEach(() => useSpecialDaysStore.setState({ specialDays: [] }));

  // Emoji read as decoration on a settings surface, and the pipeline's specs
  // (codecs, pixel sizes) are the app's business, not the reader's.
  const EMOJI = /\p{Extended_Pictographic}/u;

  it('shows no emoji on any media screen', async () => {
    const user = userEvent.setup();
    openStudio();
    expect(modalText()).not.toMatch(EMOJI);

    for (const method of [/Video & GIF/, /^Photo/]) {
      await user.click(screen.getByRole('button', { name: method }));
      expect(modalText()).not.toMatch(EMOJI);
      await user.click(screen.getByRole('button', { name: /Back/ }));
    }
  });

  it('describes the outcome rather than the encoder', async () => {
    const user = userEvent.setup();
    openStudio();
    await user.click(screen.getByRole('button', { name: /Video & GIF/ }));

    expect(modalText()).toMatch(/Trimmed, muted and shrunk/);
    expect(modalText()).not.toMatch(/re-encoded|480px|audio dropped|WebM|VP9/i);
  });
});
