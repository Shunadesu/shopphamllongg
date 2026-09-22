/**
 * Convert a YouTube URL to an embed URL suitable for <iframe src="...">.
 * Supports:
 *  - youtube.com/watch?v=VIDEO_ID
 *  - youtu.be/VIDEO_ID
 *  - youtube.com/embed/VIDEO_ID  (passthrough)
 *  - youtube.com/v/VIDEO_ID     (passthrough)
 * Returns null if the URL is not a valid YouTube URL.
 */
export function toYoutubeEmbedUrl(url) {
  if (!url) return null;

  // Already an embed URL
  if (/youtube\.com\/embed\//.test(url)) return url;

  // youtu.be/short link
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  // youtube.com/watch?v=...
  const watchMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;

  // youtube.com/v/VIDEO_ID
  const vMatch = url.match(/youtube\.com\/v\/([A-Za-z0-9_-]{11})/);
  if (vMatch) return `https://www.youtube.com/embed/${vMatch[1]}`;

  return null;
}
