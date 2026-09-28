# Supported sites

**Show in supported sites** shows the bottom-right download bubble on the hosts in this table, and on a direct link to a media file. `www` and other subdomains count as the same host.

These controls are not limited to this list:

- The toolbar icon sends the current page.
- Right-click **Send to Cove** sends a link or the page.
- **Show on all pages** shows the same bubble on every page.

**Show stylized download button** draws a site-styled button only where a layout file matches. Pornhub and YouPorn have layouts. See [src/layouts/README.md](src/layouts/README.md) to add another site.

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
| XVideos | `xvideos.com` | Yes | No | |
| XNXX | `xnxx.com` | Yes | No | |
| xHamster | `xhamster.com` | Yes | No | |
| SpankBang | `spankbang.com` | Yes | No | |
| Eporner | `eporner.com` | Yes | No | |
| YouPorn | `youporn.com` | Yes | Yes | Watch pages. See below. |
| RedTube | `redtube.com` | Yes | No | |
| TNAFlix | `tnaflix.com` | Yes | No | |
| Motherless | `motherless.com` | Yes | No | |
| Erome | `erome.com` | Yes | No | |

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

## YouPorn stylized button

Turn on **Show stylized download button**. A watch page gets an icon-only button in the action row, in the space after Flag. The icon uses the same gray as Favorite, Add to collection, Share, and Flag.

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | `/watch` | Icon after Flag | Video |

