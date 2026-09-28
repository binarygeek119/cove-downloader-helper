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
- `showText`: `true` or `false`
- `shape`: `square`, `rounded`, or `pill`
- `stack`: optional `true` or `false`. Omitted means `false`. `true` puts the icon above the label, for a tab row that already stacks its controls.
- `colors`: `#rgb` or `#rrggbb` (`background`, `text`, `icon`, `border`, `hoverBackground`). `background`, `border`, and `hoverBackground` may be `transparent` so only the icon and label show.
- `label`: short text. It is the visible label when `showText` is true, and the accessible name either way.
- `insert`: `beforebegin`, `afterbegin`, `beforeend`, or `afterend`
- `selector`: one plain CSS selector. Empty selectors, HTML, and style blocks are rejected.
- `replace`: optional `true` or `false`. Omitted means `false`. `true` hides the matched element and puts the Cove button in that slot. The insert must be `beforebegin` or `afterend`, so the button stays a sibling of the hidden control. Turning the stylized button off, or leaving the page, shows the site control again.

`id` is a short unique name inside the file (`video`, `album`, `photo`, `gif`, `gifs` in the sample).

## Check

From the repository root:

```bash
node scripts/check-layouts.mjs
```

That check also runs in CI. A file that fails it is ignored by the extension.
