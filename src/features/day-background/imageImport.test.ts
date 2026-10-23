import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestMediaForDay, mediaFileFromDataTransfer, isMotionFile } from './imageImport';
import { useSpecialDaysStore } from '../../app/specialDaysStore';

let cloudMode = false;
let canTranscode = true;

const deleteImageMock = vi.fn();
const putImageMock = vi.fn().mockImplementation(async (_b: Blob, w: number, h: number) => ({ id: 'new-img-id', w, h }));
const uploadDayImageMock = vi.fn();
const deleteDayImageMock = vi.fn();
const processVideoMock = vi.fn(async () => ({
  blob: new Blob(['clip'], { type: 'video/webm' }), w: 480, h: 270, mime: 'video/webm',
}));
const processGifMock = vi.fn(async (): Promise<{ blob: Blob; w: number; h: number; mime: string } | null> => ({
  blob: new Blob(['clip'], { type: 'video/webm' }), w: 320, h: 240, mime: 'video/webm',
}));

vi.mock('../../data/createRepository', () => ({
  isCloudMode: () => cloudMode,
}));

vi.mock('../../data/dayImageStore', () => ({
  putImage: (b: Blob, w: number, h: number) => putImageMock(b, w, h),
  deleteImage: (id: string) => deleteImageMock(id),
  getImageUrl: vi.fn(),
  hasImage: vi.fn(),
}));

vi.mock('../../data/cloudDayImages', () => ({
  uploadDayImage: (id: string, b: Blob, mime?: string) => uploadDayImageMock(id, b, mime),
  deleteDayImage: (id: string) => deleteDayImageMock(id),
}));

// The transcoder needs MediaRecorder + canvas.captureStream, neither of which
// jsdom has; the dispatch in processMedia is what these tests care about.
vi.mock('./videoImport', () => ({
  canTranscodeMotion: () => canTranscode,
  processVideo: (...args: unknown[]) => processVideoMock(...(args as [])),
  processGif: (...args: unknown[]) => processGifMock(...(args as [])),
  videoDimensions: vi.fn(async () => ({ w: 640, h: 360 })),
  imageDimensions: vi.fn(async () => ({ w: 320, h: 240 })),
  MAX_MOTION_EDGE: 480,
  MAX_RAW_MOTION_BYTES: 4 * 1024 * 1024,
}));

/** A structurally valid GIF89a with `frames` frames, so the real readGifMeta
 *  runs over it. */
function gifFile(frames = 2): File {
  const bytes: number[] = [
    ...[...'GIF89a'].map((c) => c.charCodeAt(0)),
    1, 0, 1, 0, 0x00, 0x00, 0x00,
  ];
  for (let i = 0; i < frames; i++) {
    bytes.push(0x21, 0xf9, 0x04, 0x00, 10, 0, 0x00, 0x00);
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00);
    bytes.push(0x02, 0x02, 0x4c, 0x01, 0x00);
  }
  bytes.push(0x3b);
  // Padded so the GIF is comfortably larger than the fake clip below, which is
  // what makes the "keep whichever is smaller" rule pick the clip.
  return new File([new Uint8Array(bytes), new Uint8Array(4096)], 'loop.gif', { type: 'image/gif' });
}

describe('ingestMediaForDay', () => {
  beforeEach(() => {
    cloudMode = false;
    canTranscode = true;
    deleteImageMock.mockClear();
    putImageMock.mockClear();
    uploadDayImageMock.mockClear();
    deleteDayImageMock.mockClear();
    processVideoMock.mockClear();
    processGifMock.mockClear();
    useSpecialDaysStore.setState({ specialDays: [] });

    // Mock createImageBitmap and HTMLCanvasElement methods for JSDOM
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      close: vi.fn(),
    });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    } as any);
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((cb) => {
      cb(new Blob(['dummy'], { type: 'image/webp' }));
    });
  });

  it('ingests image for day, updates store and clears customStyle', async () => {
    const mockFile = new Blob(['hello'], { type: 'image/png' });
    await ingestMediaForDay('2026-07-18', mockFile);

    const days = useSpecialDaysStore.getState().specialDays;
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      date: '2026-07-18',
      image: {
        kind: 'upload',
        id: 'new-img-id',
        w: 512, // scaled down to MAX_EDGE
        h: 384,
        media: 'image',
        mime: 'image/webp',
      },
      customStyle: undefined,
    });
    expect(putImageMock).toHaveBeenCalledTimes(1);
  });

  it('deletes existing local and cloud images if they are uploads', async () => {
    useSpecialDaysStore.setState({
      specialDays: [
        {
          id: 'existing-id',
          date: '2026-07-18',
          cosmetic: '',
          animations: [],
          emoji: '',
          recurrence: 'none',
          image: {
            kind: 'upload',
            id: 'old-img-id',
            w: 100,
            h: 100,
          },
        },
      ],
    });

    cloudMode = true;
    const mockFile = new Blob(['hello'], { type: 'image/png' });
    await ingestMediaForDay('2026-07-18', mockFile);

    expect(deleteImageMock).toHaveBeenCalledWith('old-img-id');
    expect(deleteDayImageMock).toHaveBeenCalledWith('old-img-id');
    expect(uploadDayImageMock).toHaveBeenCalledTimes(1);
  });

  it('routes a video through the clip encoder and stores a video ref', async () => {
    cloudMode = true;
    const clip = new File(['movie'], 'holiday.mov', { type: 'video/quicktime' });
    await ingestMediaForDay('2026-07-19', clip, { maxSeconds: 3 });

    expect(processVideoMock).toHaveBeenCalledWith(clip, { maxSeconds: 3 });
    expect(useSpecialDaysStore.getState().specialDays[0]).toMatchObject({
      date: '2026-07-19',
      image: { kind: 'upload', w: 480, h: 270, media: 'video', mime: 'video/webm' },
    });
    // The bucket keys the object extension off the mime, so it has to travel.
    expect(uploadDayImageMock).toHaveBeenCalledWith('new-img-id', expect.any(Blob), 'video/webm');
  });

  it('keeps the source bytes when this browser cannot re-encode', async () => {
    canTranscode = false;
    const clip = new File(['movie'], 'clip.webm', { type: 'video/webm' });
    await ingestMediaForDay('2026-07-20', clip);

    expect(processVideoMock).not.toHaveBeenCalled();
    expect(useSpecialDaysStore.getState().specialDays[0]).toMatchObject({
      image: { media: 'video', mime: 'video/webm', w: 640, h: 360 },
    });
  });

  it('re-encodes an animated GIF into a clip, one loop long', async () => {
    await ingestMediaForDay('2026-07-22', gifFile());

    expect(processGifMock).toHaveBeenCalledWith(
      expect.any(File),
      // Two frames at 10cs each: the recording covers exactly that.
      expect.objectContaining({ durationSec: 0.2, frameDelaySec: 0.1 }),
    );
    expect(useSpecialDaysStore.getState().specialDays[0].image).toMatchObject({
      media: 'video', mime: 'video/webm', w: 320, h: 240,
    });
  });

  it('keeps the GIF when this webview cannot capture its animation', async () => {
    // A frozen clip would be worse than the GIF, which animates by itself.
    processGifMock.mockResolvedValueOnce(null);
    await ingestMediaForDay('2026-07-23', gifFile());

    expect(useSpecialDaysStore.getState().specialDays[0].image).toMatchObject({
      media: 'image', mime: 'image/gif',
    });
  });

  it('keeps the GIF when re-encoding it would not be smaller', async () => {
    processGifMock.mockResolvedValueOnce({
      blob: new Blob([new Uint8Array(999_999)], { type: 'video/webm' }), w: 320, h: 240, mime: 'video/webm',
    });
    await ingestMediaForDay('2026-07-24', gifFile());

    expect(useSpecialDaysStore.getState().specialDays[0].image).toMatchObject({
      media: 'image', mime: 'image/gif',
    });
  });

  it('treats a single-frame GIF as a still photo', async () => {
    await ingestMediaForDay('2026-07-25', gifFile(1));

    expect(processGifMock).not.toHaveBeenCalled();
    expect(useSpecialDaysStore.getState().specialDays[0].image).toMatchObject({
      media: 'image', mime: 'image/webp',
    });
  });

  it('refuses a format the bucket would reject when it cannot re-encode', async () => {
    canTranscode = false;
    const clip = new File(['movie'], 'clip.mov', { type: 'video/quicktime' });
    await expect(ingestMediaForDay('2026-07-21', clip)).rejects.toThrow(/MP4, WebM or GIF/);
    expect(useSpecialDaysStore.getState().specialDays).toHaveLength(0);
  });
});

describe('mediaFileFromDataTransfer', () => {
  const dt = (files: File[]) => ({ files, items: [] } as unknown as DataTransfer);

  it('accepts videos and GIFs alongside images', () => {
    const clip = new File(['x'], 'a.mp4', { type: 'video/mp4' });
    expect(mediaFileFromDataTransfer(dt([clip]))).toBe(clip);
  });

  it('falls back to the file name when the drag carries no type', () => {
    const clip = new File(['x'], 'a.webm', { type: '' });
    expect(mediaFileFromDataTransfer(dt([clip]))).toBe(clip);
  });

  it('ignores files that are neither image nor video', () => {
    expect(mediaFileFromDataTransfer(dt([new File(['x'], 'notes.txt', { type: 'text/plain' })]))).toBeNull();
    expect(mediaFileFromDataTransfer(null)).toBeNull();
  });
});

describe('isMotionFile', () => {
  it('is true for clips and GIFs only', () => {
    expect(isMotionFile(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBe(true);
    expect(isMotionFile(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe(true);
    expect(isMotionFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(false);
  });
});
