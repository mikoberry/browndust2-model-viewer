# browndust2-model-viewer

**English** · [简体中文](README.zh-CN.md)

A **Spine wallpaper / model viewer** for *Brown Dust 2* — React 18 + Vite 5 + `@esotericsoftware/spine-webgl@4.1.56`.
It reads `model-library/` directly, so it runs without Wallpaper Engine; the wallpaper page can optionally layer
the [WallKit](https://github.com/mikoberry/wallkit) overlay widgets (clock / spectrum / album art / ambient particles /
weather light / pointer effects / spotlight / viewfinder), and once hosted inside Wallpaper Engine the spectrum and
album art receive real audio and media data.

---

## AI development & disclaimer

This is a personal, non-commercial hobby project. Its code, documentation, UI copy and translations were mostly
written with AI assistance, and were reviewed and tested by hand. AI-generated content may contain errors, omissions
or inaccurate wording; nothing here represents an official position, and nothing here is professional advice. The
project is provided as-is, without warranty of any kind — use it at your own risk.

This project is not affiliated with, endorsed by, or supported by the game it depicts, its developer or its publisher.
The character models, images and Spine assets used in it remain the property of their respective rights holders and are
included for study, research and personal display only; no commercial licence is granted. If anything here infringes
your rights, open an issue and it will be removed.

Corrections and improvements are welcome — issues pointing out mistakes, along with translation fixes, are especially
appreciated.

---

## Running it

```bash
npm install
npm run dev             # root = wallpaper; append /spine-viewer for the debug page
npm run build           # dist/ (ESM: browser / static hosting)
npm run build:we        # default: plain build (real asset files) + deploy to the Wallpaper Engine project
npm run build:we:embed  # alternative: self-contained file:// build (assets inlined as base64) + deploy
npm run verify:embed    # check the self-contained bundle (pure Node, no browser needed)
npm run preview         # preview the build output
npm run model:list      # print the model-library scan result
```

**The two artefacts are interchangeable** — same `dist/`:

| Command | Output | Assets | Runs on |
| --- | --- | --- | --- |
| `npm run build` / `build:home` | multi-file ESM | real files under `dist/models/**` | browsers, http static hosting, `npm run preview` |
| `npm run build:home:embed` | single-entry IIFE + `embed-assets.js` | base64 inlined, zero requests | all of the above, **plus file://** |

`build:we` = plain build + deploy (default); `build:we:embed` = self-contained build + deploy (fallback).

Wallpaper Engine **2.8.797 beta** (CEF 156, file:// local reads blocked by default) can only run the embed build, so
use `npm run build:we:embed` on that beta. If a stable release restores file access, the default `build:we` output works
as-is. The deploy script tells the two apart by checking whether the target contains `assets/embed-assets.js`, and says
which one it deployed.

During development, open `http://localhost:5173/spine-viewer`.

## Two routes

| Path | Purpose |
| --- | --- |
| `/` (and every other path) | **Wallpaper**: full-screen model + matching backdrop, zero UI by default |
| `/spine-viewer` | **Debugging aid**: the full viewer (model library / toolbar / inspector / timeline) |

The root route's model, backdrop, framing and playback parameters come from the shipped `wallpaper.config.json`
(**the single source of truth**) merged with the built-in fallbacks in `src/features/wallpaper/config.js` (which
static-imports that JSON) — editing the defaults means editing the JSON.

## Wallpaper settings

The handle in the bottom-right corner (or the `S` key) opens the settings drawer. Tabs:
**Composition · Clock · Spectrum · Album art · Ambient · Light · Pointer · Other**
(the spotlight is the second section inside "Pointer" and keeps its own `overlay.spotlight` key; the viewfinder lives
in "Other" as `overlay.frame` — it covers the whole picture and has no position anchor, so it doesn't get a tab;
its corner readouts have a single switch (`overlay.frame.labels`) over a fixed preset copy, since Wallpaper Engine
gives the wallpaper window no keyboard focus).

"Record config" writes to `localStorage['mikoberry:wallpaper.config.user:<modelId>']`, and from then on that snapshot
wins at startup; `wallpaper.config.json` is only the factory default ("Restore factory defaults" returns to it).

The topmost button in the bottom-right column is a party popper, armed by `overlay.burst` in
`public/wallpaper.config.json` (absent = no button). One click fires a single wallkit `BurstFx` burst at the
configured point; the drawer has no settings for it and "Record config" never writes the key, so the shipped
file stays authoritative (see [docs/wallkit.md](docs/wallkit.md)).

Priority: built-in defaults (already folded into the JSON) < `wallpaper.config.json` < user "Record config".

Storage keys look like `mikoberry:<base key>:<modelId>` (`STORAGE_OWNER` is a human-readable marker you can replace
with any fixed string): every web wallpaper in WE shares one `file://` origin's localStorage, so bare keys would make
"Record config" overwrite each other (one wallpaper's composition / backdrop / overlay clobbering another). The snapshot
and the follow nudge (`mikoberry:wallpaper.followPrompt.dismissed:<modelId>`) therefore carry the model suffix, while
the locale (`wallpaper.locale`) and the perf HUD flag (`bd2.stats`) stay deliberately global. Two projects wrapping the
same model share one record — that is intentional.

### Display variants (several looks for one character)

A BD2 character often ships two idle loops (`loop` / `loop_2`) with a matching backdrop each. Write each look as an
entry in `variants` and the drawer grows switching buttons: the first chip is always "Base" (= the top-level config
itself, `variant: ''`), the variants follow — so **a single variant is enough to switch**, no need to duplicate the base
just to have two chips:

```json
"variant": "loop2",
"variants": [
  { "id": "loop",  "label": "Casual", "animation": "loop",   "backdrop": "char021391 back1.png" },
  { "id": "loop2", "label": "Formal", "animation": "loop_2", "backdrop": "char021391 back2.png" }
]
```

- A variant is an **override set**: only the keys it changes, everything else inherits from the base config
  (overridable: `animation` / `backdrop` / both transforms / `parallax` / `sequence` / `entrance` / `clickAnimation` /
  `zoom` / `speed`).
- **Exception: `entrance.autoplay` (play on start) is global** — it lives at the top level and applies to every variant;
  a value inside a variant is ignored. `entrance.blend` and per-clip framing stay per look.
- `variant` picks the look used at startup; `''` or an unknown id falls back to the base composition.
- **`design` / `fit` and `modelId` cannot vary per variant**: the design canvas is the unit every offset is measured
  in, so changing it would silently reinterpret the whole set of numbers. A variant's backdrop is fitted onto the same
  canvas by `fit` (mismatched aspect ratios get cropped).
- The bottom-right corner grows a **switch-artwork button** above the replay / settings toggles whenever at least one
  variant exists: it cycles base → each variant → base, and its tooltip names where the next click lands. Switching is
  instant and in-memory — "Record config" is what makes it stick.
- Easiest way to set it up: the "Composition" tab in `/spine-viewer`. The "Display artwork" row at the top adds /
  renames / sets-as-default / removes looks (the base can be the startup default too — that is just `variant: ""`), and
  every slider below writes into the selected look only. See [docs/display-variants.md](docs/display-variants.md).

### Saving configs per character (preset library)

`publish/wallpaper.presets.json` (in `publish/`, not shipped in dist) is a hand-maintained **character config library** (code never
reads it): frame a character, hit "Record config" in the drawer, paste the full config from the clipboard into that
file's `presets` under the character's `modelId`. To switch characters, copy the wanted block over
`wallpaper.config.json` and reload; if you recorded a config before, click "Restore factory defaults" once (clears the
localStorage snapshot) and reload, otherwise the file won't take effect.

## Deploying to Wallpaper Engine

```bash
npm run build:we        # default: plain build (real files in dist/models/) + deploy
npm run build:we:embed  # alternative: self-contained file:// build (base64 assets) + deploy
npm run deploy:we       # copy the existing dist/ only, no rebuild
```

The target defaults to `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`.
Use **`--target`** (recommended, identical in cmd / PowerShell / bash) to point elsewhere:

```bash
npm run build:we:embed -- --target "F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-embed"
npm run build:we       -- --target "F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-plain"
```

`WE_PROJECT` / `WE_TITLE` env vars also work, but they are shell-specific (bash `WE_PROJECT=x npm run …`,
cmd `set "WE_PROJECT=x"` first, PowerShell `$env:WE_PROJECT='x';`).

`project.json` is generated from **`publish/project.config.js`** (`wallkit/project`'s `defineProject` enforces the
shape, `mergeProject` preserves the `workshopid` / `preview` / `version` the WE editor wrote). `type: "Web"` and
`general.supportsaudioprocessing: true` (needed by the spectrum / album art) are filled in automatically; drop a
`preview.jpg|png|gif` into the deploy directory to get a thumbnail.

To change the Workshop title, description or the custom text in the property panel (avatar, please rate & subscribe,
home page, credits), edit `publish/project.config.js` and run `npm run project:gen` — **no rebuild needed**;
`npm run project:check` only reports drift without writing. Panel text uses `html()` blocks: the engine renders them as
HTML and never forwards them to the page, so the running wallpaper needs no changes; GitHub links are not on the panel
whitelist, so the home page is a coloured `<a>` you still have to copy into a browser, while the avatar
`github.com/mikoberry.png` renders fine.

### When you need the self-contained build (`build:we:embed`)

Wallpaper Engine **2.8.797 beta** moved to CEF 156 (Chromium 156) and **blocks file:// pages from reading local files**
by default. The plain build dies completely on that beta: module scripts, `crossorigin` stylesheets, Spine's XHR for
skel / atlas and the `<img>` loads for atlas pages are all blocked → black screen.

That is beta behaviour and a stable release may restore file access, so **the plain build stays the default**; if you
get a black screen, switch to `npm run build:we:embed`. The self-contained output **issues no local requests at all**:

- the entry is bundled as an IIFE and loaded with a classic `<script defer src>` (no `type="module"`, no `crossorigin`);
- styles are injected into the JS chunk by Vite (under iife there is no external `.css`);
- every asset (skel / atlas / atlas pages / backdrops) is base64-inlined into `dist/assets/embed-assets.js` and decoded
  at runtime through Spine's own `setRawDataURI()` channel; `dist/models/` is no longer produced;
- the factory config is injected as `dist/assets/embed-config.js` (`window.__BD2_WALLPAPER_CONFIG__`).

**Cost**: the deployed `wallpaper.config.json` is no longer read inside WE, so tweaking means editing
`public/wallpaper.config.json` and re-running `npm run build:we:embed`. The drawer's "Record config" (localStorage)
still takes priority. The output is ~37 MB (base64 adds ~33%), plus ~36 MB of resident memory.

Details and troubleshooting: [docs/we-file-access.md](docs/we-file-access.md).

### Importing it yourself in the WE editor

If you don't want a script copying into the project directory (creating a fresh project, or maintaining `project.json`
yourself), build without deploying:

```bash
npm run build:home:embed     # output in dist/, no WE directory touched
```

Then in WE choose "Create wallpaper" and drop in `dist/index.html`, and fill the panel text
(`project:latest` adopts the folder you touched last under `myprojects` — resuming work, no path to
remember; add `--created` when you want the newest folder instead. It leaves the title already in that
folder alone, so each wallpaper keeps its own name; `--force-title` overrides):

```bash
npm run project:latest
npm run project:gen   -- --target "F:/.../wallpaper_engine/projects/myprojects/your-new-project"
npm run project:check -- --target "F:/.../wallpaper_engine/projects/myprojects/your-new-project"
```

Full steps, the four hard rules for hand-written `general` blocks and the usual traps:
[docs/we-manual-import.md](docs/we-manual-import.md).

## Performance self-check

The wallpaper page has a **off-by-default** runtime readout
(`src/features/wallpaper/components/StatsHud.jsx`):

**Toggle: drawer → "Other" → show the top-left perf panel** (instant, no reload; the state lives in localStorage).

If the drawer is unreachable on a device (ad-hoc debugging, sending a build to someone), there are two URL escapes:

```
index.html?stats=1
index.html#stats
```

Top-left shows `fps / p95 / worst / long` (last second), `cpu` (main-thread time per frame for skeleton update + draw
submission, reported by `SpineStage`), `heap` (`performance.memory`), `buf` (the WebGL drawing buffer, i.e. the pixels
actually shaded per frame) and `gpu` (the real GPU model string). The drawer itself costs a little performance — close
it while taking readings.

How to read them:

| Metric | Healthy | What an overshoot means |
| --- | --- | --- |
| `p95` | ≤ 17 ms (60 Hz) | 60 average but p95 above 25 ms already looks like stutter |
| `cpu` | ≤ 4 ms (a quarter of the 16.7 ms budget) | with vsync locked at 60 fps is invisible; this is what shows headroom. Above 8 ms low-end CPUs start dropping frames |
| `long` | 0–1 per second | sustained > 3 means long JS tasks are hogging the main thread |
| `heap` | embed build: ~36 MB resident + scene | still climbing after switching entrance / backdrop means a leak |
| `buf` | equals the screen's physical pixels | at 4K + dpr 2 fill rate is the main bottleneck on integrated GPUs |

Reference baseline (a real machine, to judge whether a new reading is off):

| Machine / scene | Reading |
| --- | --- |
| RTX 4070, 2560×1440 window, 5120×2880 backdrop × overscan 1.5 | `fps 60` / `p95 16.8ms` / `long 0` / **`cpu ≈1.5ms`** / `heap 169MB` / `buf 3840×2160` |

`cpu 1.5ms` means the main thread used 9% of the 16.7 ms budget — roughly 10× headroom. This machine's bottleneck is
purely fill rate, not CPU / JS. So "will it stutter on a weaker machine" depends on the GPU and resolution, not on code
efficiency: `buf` at 4K × overscan (`5760×3240`, ~18.7 M pixels per frame) is the real test for integrated graphics.

## Adding models

`model-library/` is scanned recursively (two levels: `character / skin`) and is a read-only asset source:

```
model-library/
  Wilhelmina/
    Iron_Monarch/
      cutscene_char067601.skel     # or .json
      cutscene_char067601.atlas
      cutscene_char067601.png      # multi-page atlases are separate xxx_2.png … files
  backdrops/
    067601/                        # bucketed by the 6-digit character id; the id in the filename is the join key
      char067601_back1.png
```

- In dev a Vite plugin serves the source files as `/models/<path relative to disk>`; a build only emits the files the
  manifest references.
- `backdrops/` **only keeps buckets for characters that have a local model** — downloaded buckets with no model are
  pointless on disk or in git. After adding a model run `npm run backdrops:add -- <6-digit id>` to pull that bucket from
  upstream and add it to the `.gitignore` allowlist; `npm run backdrops:prune` does the reverse (deletes model-less
  buckets and shrinks the allowlist).

## Layout

Feature-based: `app/` is the application layer, `features/` holds the two independent product capabilities, `lib/` is
shared technical code.

```
src/
  main.jsx
  app/                # routing (App.jsx / router.js)
  features/
    wallpaper/        # the real wallpaper on the root route (WallpaperPage + settings drawer + WallKit overlay)
    viewer/           # the /spine-viewer debugging viewer
  lib/
    spine/            # shared Spine engine (SpineStage / useSpineAsset / clipLayers)
    composition.js    # design-canvas composition math (single source, recomputable in plain Node)
    backdrops.js      # backdrop selection
    animation.js      # default animation / expression picking + entrance sequence detection
    assets.js         # asset URLs
    uiScale.js        # viewport → --ui-scale
  styles/global.css
model-library/        # the only asset source, read-only
```

## More docs

The `docs/` files are written in Chinese; the numbering and file names are stable.

- [Wallpaper & composition](docs/wallpaper.md) — design-canvas basis, the two independent transforms, entrance sequences
  and per-clip framing, the config file in detail
- [Display variants](docs/display-variants.md) — data shape for multiple looks (loop + backdrop), overridable keys,
  in-app configuration and write-back
- [WallKit overlay](docs/wallkit.md) — the widgets, WE data bridging, the boundary with composition
- [Implementation notes](docs/implementation.md) — Spine pitfalls, composition math, architecture rules
- [Manual WE import](docs/we-manual-import.md) — build without deploying, import yourself, maintain `project.json` by hand

> `AGENTS.md` is the constraint list for coding agents (architecture rules, Spine pitfalls, composition math, execution
> rules, git conventions) and is kept in sync with the implementation. This README is the reference for usage and
> configuration.
