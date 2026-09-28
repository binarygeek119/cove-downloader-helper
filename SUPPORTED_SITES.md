# Supported sites

**Show in supported sites** shows the bottom-right download bubble on the hosts in this table, and on a direct link to a media file. `www` and other subdomains count as the same host.

These controls are not limited to this list:

- The toolbar icon opens the job queue beside the page.
- Right-click **Send to Cove** sends a link or the page.
- **Show on all pages** shows the same bubble on every page.

**Show stylized download button** draws a site-styled button only where a layout file matches. Pornhub, XVideos, xHamster, SpankBang, and YouPorn have layouts. See [src/layouts/README.md](src/layouts/README.md) to add another site.

Cove can also add hosts from the downloaders installed on your instance. Those extra hosts are not listed here. Sending a URL still depends on the downloaders installed in Cove. This page is what the extension treats as a supported site.

## Sites

| Site | Hosts | Supported-sites bubble | Stylized download button | Notes |
| --- | --- | --- | --- | --- |
| Direct media file | Any host. The path ends in `.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v`, `.mp3`, `.m4a`, `.flac`, `.wav`, `.ogg`, `.opus`, `.jpg`, `.jpeg`, `.png`, `.gif`, or `.webp` | Yes | No | |
| Literotica | `literotica.com` | Yes | No | Text pages prefer the text downloader |
| Soundgasm | `soundgasm.net` | Yes | No | Audio pages prefer audio |
| Whyp | `whyp.it` | Yes | No | Audio pages prefer audio |
| Reddit | `reddit.com`, `redd.it` | Yes | No | |
| RedGifs | `redgifs.com`, `redgif.com` | Yes | No | |
| YouTube | `youtube.com`, `youtu.be`, `youtube-nocookie.com` | Yes | No | |
| Vimeo | `vimeo.com` | Yes | No | |
| Twitch | `twitch.tv` | Yes | No | |
| TikTok | `tiktok.com` | Yes | No | |
| Instagram | `instagram.com` | Yes | No | |
| X | `x.com`, `twitter.com` | Yes | No | |
| Facebook | `facebook.com`, `fb.watch` | Yes | No | |
| Dailymotion | `dailymotion.com` | Yes | No | |
| SoundCloud | `soundcloud.com` | Yes | No | |
| Bandcamp | `bandcamp.com` | Yes | No | |
| Rumble | `rumble.com` | Yes | No | |
| BitChute | `bitchute.com` | Yes | No | |
| Odysee | `odysee.com` | Yes | No | |
| Niconico | `nicovideo.jp` | Yes | No | |
| Bilibili | `bilibili.com` | Yes | No | |
| Streamable | `streamable.com` | Yes | No | |
| Imgur | `imgur.com` | Yes | No | |
| Pornhub | `pornhub.com` | Yes | Yes | Video, photo, and gif pages. See below. |
| XVideos | `xvideos.com` | Yes | Yes | Watch pages. The site download button is replaced. See below. |
| XNXX | `xnxx.com` | Yes | No | |
| xHamster | `xhamster.com` | Yes | Yes | Watch pages. See below. |
| SpankBang | `spankbang.com` | Yes | Yes | Watch pages, in the Subscribe row. See below. |
| Eporner | `eporner.com` | Yes | No | |
| YouPorn | `youporn.com` | Yes | Yes | Watch pages. See below. |
| RedTube | `redtube.com` | Yes | No | |
| TNAFlix | `tnaflix.com` | Yes | No | |
| Motherless | `motherless.com` | Yes | No | |
| Erome | `erome.com` | Yes | No | Hover an album. The bottom-right icon opens the video selector. On an album page, the page’s bottom-right icon does the same. |

## Pornhub stylized button

Turn on **Show stylized download button**. These pages get a button. An image click stays unsent when Cove has no image downloader for that URL.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Video | `/view_video.php` | Download pill after Subscribe | Video |
| Photo | `/photo` | Icon in the rating bar | Image |
| Album | `/photo` | Download button on the album block | Image |
| Gif | `/gif` | Icon in the voting bar | Image |
| Gif grid | `/gif` | Icon on each gif block | Image |

`path` is a prefix, so `/photo` also matches `/photos` and `/gif` also matches `/gifs`. `/album/...` does not match.

## XVideos stylized button

Turn on **Show stylized download button**. A watch page whose path starts with `/video.` hides the site download button and puts the Cove button in that slot. The button has no backing color. The icon uses the same gray as the other action icons. The label is black in light mode and white in dark mode.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | `/video.` | Replaces the site download button | Video |

## xHamster stylized button

Turn on **Show stylized download button**. A watch page whose path starts with `/videos/` gets a Download button in the action row, after the flag. The button uses the same dark fill and light icon as the other controls in that row. The flag stays.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | `/videos/` | Download after the flag | Video |

## SpankBang stylized button

Turn on **Show stylized download button**. A watch page adds Download in the Subscribe and Message row, immediately before Subscribe. Subscribe and Message stay on that line and move over to make room. Download uses the same gold fill and dark label as Subscribe.

A watch URL starts with the video id, as in `/iavy/video/...`, so the layout path is `/`. The button is added only when that page has the Subscribe control. Home, search, and profile pages do not.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | `/` | Download before Subscribe | Video |

## YouPorn stylized button

Turn on **Show stylized download button**. A watch page gets an icon-only button in the action row, in the space after Flag. The button has no backing color. The icon uses the same gray as Favorite, Add to collection, Share, and Flag.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | `/watch` | Icon after Flag | Video |

