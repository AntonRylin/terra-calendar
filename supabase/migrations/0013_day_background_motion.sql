-- Migration 0013: video & GIF day backgrounds.
--
-- Day backgrounds can now be short muted video clips (and animated GIFs), not
-- just WebP stills. The bucket, its layout and its RLS policies are unchanged —
-- objects still live at {auth.uid()}/{mediaId}.{ext} with folder-scoped access
-- and writes gated on has_cloud_access() (0008 + 0009) — but two of the abuse
-- limits set in 0009 have to move:
--
--   * allowed_mime_types was image/webp only, so every clip upload would be
--     rejected with "mime type not supported". The app re-encodes to WebM (VP9)
--     where it can and MP4 (H.264) on WebKit webviews, and stores a GIF as-is
--     when the webview can't re-encode at all — those four are the complete set
--     of types the client ever uploads (see core/media.ts STORABLE_MIMES).
--   * file_size_limit stays deliberately tight. Clips are capped client-side at
--     480px / 15 fps / ~600 kbps for at most 10 s, which lands well under 1 MB;
--     8 MB leaves room for the un-optimised fallback path without turning the
--     bucket into free video hosting.
--
-- Apply via the Supabase SQL editor or `supabase db push`.

update storage.buckets
  set file_size_limit = 8388608, -- 8 MB
      allowed_mime_types = array['image/webp', 'image/gif', 'video/webm', 'video/mp4']
  where id = 'day-backgrounds';
