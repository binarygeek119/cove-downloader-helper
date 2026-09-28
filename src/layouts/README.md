# Site download button layouts

Layouts are data files. Each site is one `.lay` file. The extension reads that file and draws the button. A new site does not need a change to the extension code.

Copy [`pornhub.lay`](pornhub.lay), save it as `sitename.lay` in this folder, and add that filename to [`index.json`](index.json). Open a pull request that adds those two changes.

## File shape

`hosts` matches the site, including `www` and subdomains. Each `targets` entry is one path on that host. `path` is the start of the URL path. The query string is ignored. The longest matching path wins, so `/photo` matches `/photo/868704295` and `/photos`, and a longer path wins when both match.

`kind` chooses what this click downloads. It does not change the saved preferred mode.

| `kind` | Cove receives |
| --- | --- |
| `video` | Video. yt-dlp video can still be used when nothing else matches. |
| `image` | Image. If Cove returns no image downloader, the button says image is not supported. |
| `gif` | Image, same rule as `image`. |
| `story` | Text. If Cove returns no text downloader, the button says text is not supported. |

```json
{
  "version": 1,
  "hosts": ["example.com"],
  "targets": [
    {
      "id": "watch",
      "kind": "video",
      "path": "/watch",
      "anchor": { "selector": ".player-actions .download", "insert": "beforebegin", "replace": true },
      "button": {
        "size": "medium",
        "showText": true,
        "label": "Download",
        "shape": "rounded",
        "colors": {
          "background": "#ff9000",
          "text": "#ffffff",
          "icon": "#ffffff",
          "border": "#ff9000",
          "hoverBackground": "#ffa31a"
        }
      }
    }
  ]
}
```

## Button

Every button uses the extension’s download icon. Pick the rest so it sits in the page like part of that site.

- `size`: `small`, `medium`, or `large`
- `width` and `height`: optional pixel size. `width` is 16 to 480. `height` is 16 to 160. Omitted means the size preset.
- `scale`: optional number from 0.5 to 2. It multiplies the button’s height, width, type, and icon. Omitted means 1.
- `fit`: optional `true` or `false`. `true` matches the height of the other buttons in that row, including when the window resizes or the side panel opens. Omitted means `false`.
- `hover`: optional `true` or `false`. `true` uses `hoverBackground` while the pointer is on the button. `false` keeps the normal background. Omitted means `true`.
- `light` and `dark`: optional color sets (`background`, `text`, `icon`, and optionally `border` and `hoverBackground`). The button uses `dark` when the site is in dark mode and `light` when it is in light mode. `colors` is the fallback.
- `showText`: `true` or `false`
- `shape`: `square`, `rounded`, or `pill`
- `colors`: `#rgb` or `#rrggbb` (`background`, `text`, `icon`, `border`, `hoverBackground`). `background`, `border`, and `hoverBackground` may be `transparent` so only the icon and label show.
- `label`: short text. It is the visible label when `showText` is true, and the accessible name either way.
- `insert`: `beforebegin`, `afterbegin`, `beforeend`, or `afterend`
- `selector`: one plain CSS selector. Empty selectors, HTML, and style blocks are rejected.
- `replace`: optional `true` or `false`. Omitted means `false`. `true` hides the matched element and puts the Cove button in that slot. The insert must be `beforebegin` or `afterend`, so the button stays a sibling of the hidden control. Turning the stylized button off, or leaving the page, shows the site control again.
- `x` and `y`: optional pixel offsets, used together. They place the button at a fixed position instead of in the row. `x` is from the left and `y` is from the top.

`theme` on the file, next to `hosts`, tells the button how that site marks dark or light mode. `theme.dark` and `theme.light` are plain CSS selectors. A matching `theme.dark` selector uses the dark colors. Otherwise the button follows the page background.

`id` is a short unique name inside the file (`video`, `album`, `photo`, `gif`, `gifs` in the sample).

## Check

From the repository root:

```bash
node scripts/check-layouts.mjs
node scripts/scan-sites.mjs
```

Those checks also run in CI. A layout file that fails the first check is ignored by the extension. The second check keeps this folder, `SUPPORTED_SITE_HOSTS`, and [SUPPORTED_SITES.md](../../SUPPORTED_SITES.md) on the same hosts and paths.
