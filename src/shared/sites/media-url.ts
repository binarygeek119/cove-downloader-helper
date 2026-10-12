import { isHttpUrl, parseHttpUrl } from "../url";

const PROGRESSIVE_VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|mkv|ogv|ogg|flv)$/i;
const STREAM_VIDEO_EXT = /\.(?:m3u8|mpd)$/i;

function pathHasExt(value: string, pattern: RegExp): boolean {
  const url = parseHttpUrl(value);
  return !!url && pattern.test(url.pathname);
}

/** A direct video file or an HLS/DASH playlist, as opposed to a watch page. */
export function isVideoFileUrl(value: string): boolean {
  return pathHasExt(value, PROGRESSIVE_VIDEO_EXT) || pathHasExt(value, STREAM_VIDEO_EXT);
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fileNameForCove(mediaUrl: string): string {
  let base = "video.mp4";
  const url = parseHttpUrl(mediaUrl);
  const segment = url?.pathname.split("/").filter(Boolean).pop();
  if (segment) {
    try {
      base = decodeURIComponent(segment);
    } catch {
      base = segment;
    }
  }
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_");
  if (/\.[A-Za-z0-9]+$/.test(cleaned)) return cleaned.slice(0, 120);
  return (cleaned.slice(0, 110) || "video") + ".mp4";
}

const RESOLUTION_WIDTHS: Record<number, number> = {
  240: 426,
  360: 640,
  480: 854,
  720: 1280,
  1080: 1920,
  1440: 2560,
  2160: 3840,
};

export function streamResolution(fileName: string): string {
  const match = /(?:^|[^0-9])(240|360|480|720|1080|1440|2160)p/i.exec(fileName);
  const height = match ? Number(match[1]) : 720;
  return `${RESOLUTION_WIDTHS[height] ?? 1280}x${height}`;
}

/** yt-dlp reads `#__youtubedl_smuggle=` to send the page as the referer for the media request. */
export function withYtDlpReferer(url: string, pageUrl: string): string {
  const page = parseHttpUrl(pageUrl);
  if (!page) return url;
  return url + "#__youtubedl_smuggle=" + encodeURIComponent(JSON.stringify({ referer: page.href }));
}

/**
 * A bare MP4 has no codec and no height, so the yt-dlp downloader in Cove reports that it is not
 * a video. Wrapping it in a one-segment HLS playlist keeps the original bytes and gives yt-dlp a
 * codec. The page referer is what a browser save sends; file hosts such as Erome reject the
 * download without it.
 */
export function progressiveVideoUrlForCove(mediaUrl: string, pageUrl: string): string {
  const media = new URL(mediaUrl);
  media.hash = "";
  const fileHref = media.href.replace(/[\r\n]/g, "");
  const fileName = fileNameForCove(fileHref);
  const mediaPlaylist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:86400",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXTINF:86400.0,",
    fileHref,
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");
  const masterPlaylist = [
    "#EXTM3U",
    `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=${streamResolution(fileName)},CODECS="avc1.4d401f,mp4a.40.2"`,
    "data:application/vnd.apple.mpegurl;base64," + utf8Base64(mediaPlaylist),
    "",
  ].join("\n");
  const wrapped = `data:application/vnd.apple.mpegurl;filename=/${fileName};base64,${utf8Base64(masterPlaylist)}`;
  return withYtDlpReferer(wrapped, pageUrl);
}

/** Turn a media file or playlist address into something the yt-dlp downloader in Cove can fetch. */
export function videoUrlForCove(mediaUrl: string, pageUrl: string): string {
  try {
    if (pathHasExt(mediaUrl, PROGRESSIVE_VIDEO_EXT)) return progressiveVideoUrlForCove(mediaUrl, pageUrl);
    if (!pathHasExt(mediaUrl, STREAM_VIDEO_EXT) || !isHttpUrl(pageUrl)) return mediaUrl;
    if (new URL(mediaUrl).href === new URL(pageUrl).href) return mediaUrl;
    return withYtDlpReferer(new URL(mediaUrl).href, pageUrl);
  } catch {
    return mediaUrl;
  }
}
