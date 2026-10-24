# FolderView compatibility plan

How Aurora Theme reaches, proves and keeps full compatibility with the two folder plugins for
Unraid's Docker and VMs lists:

- **FolderView Plus** (`folderview.plus`, [alexphillips-dev/FolderView-Plus](https://github.com/alexphillips-dev/FolderView-Plus))
- **FolderView3** (`folder.view3`, [chodeus/folder.view3](https://github.com/chodeus/folder.view3))

Status: work on the `dev` branch. Nothing in this plan is released until every gate in
[Release gates](#7-release-gates) is green.

## 1. What "compatible" means

Compatibility is not a feeling; it is a list of conditions that a test can check. Aurora is
compatible with a folder plugin when, on the plugin's Docker, Dashboard and VMs pages (and the
plugin's own settings page):

| # | Condition | How it is checked |
|---|---|---|
| C1 | The plugin's folders appear, with the same folders, rows and chips as without Aurora | `plugin/test/*_compat.mjs`, folder and row counts |
| C2 | Aurora puts nothing of its own into lists the plugin owns (groups, compact view, chips, buttons), except what this plan allows per mode (section 3) | per-page `inspect()` in the checks |
| C3 | No hang: the folders appear within twice the plugin's own time plus 1.5 s | checks, "ready after" |
| C4 | No lasting extra load: in the steady window (live updates only) the page is blocked at most 30 % / 150 ms more than without Aurora | checks, "steady" |
| C5 | Finishing the page costs at most twice the plugin's own time plus 0.3 s | checks, "settling" |
| C6 | No new script errors | checks, page errors |
| C7 | Aurora follows the plugin's documented rules for themes (FolderView Plus: [Layout Ownership for Theme Integrations](https://github.com/alexphillips-dev/FolderView-Plus/blob/main/docs/THEME_API_CONTRACT.md#layout-ownership-for-theme-integrations)) | review against section 4 |
| C8 | It looks right: readable, nothing cut off or overlapping, in Black and White | screenshot review (section 6.3) and real servers |
| C9 | It works on real servers: Unraid 7.2, 7.3 and the current 7.4 release candidate, Chromium and Firefox | real-server checklist (section 6.4) |

"100 %" means C1 to C9 hold for the newest release of each plugin and stay that way: C1 to C6 are
re-checked automatically every week against both plugins' newest code (section 6.2).

## 2. Where it stands

Measured with the plugins' real, unmodified scripts and styles on a synthetic Unraid host (section
6.1), Chromium, Aurora from `dev`:

Times: folders drawn (ready), then browser blocked in the 8 s "settling" window and the next 8 s
"steady" window. Plugin alone → with Aurora.

**FolderView Plus** (newest code, 2026.10.22.06)

| Page | 90 containers / 24 VMs | 300 containers / 60 VMs | Result |
|---|---|---|---|
| Docker | ready 0.8 → 0.9 s, steady 0 → 0 ms | ready 2.9 → 3.5 s, steady 506 → 526 ms | pass |
| Dashboard | ready 0.36 → 0.43 s, 0 ms | ready 0.78 → 0.69 s, 0 ms | pass |
| VMs | ready 0.30 → 0.45 s, 0 ms | ready 0.33 → 0.52 s, steady 0 ms | pass |
| Settings | ready 0.86 → 1.03 s, 0 ms | ready 0.93 → 1.01 s, settling 220 → 307 ms, steady 0 ms | pass |

**FolderView3** (newest code, main of 2026-10-24)

| Page, mode | 90 containers / 24 VMs | 300 containers / 60 VMs | Result |
|---|---|---|---|
| Docker, FolderView mode | ready 0.35 → 0.58 s, settling 0 → 147 ms, steady 0 ms | ready 1.1 → 1.5 s, settling 391 → 617 ms, steady 0 ms | pass |
| Dashboard, FolderView mode | ready 0.23 → 0.30 s, 0 ms | ready 0.48 → 0.60 s, 0 ms | pass |
| VMs, FolderView mode | ready 0.18 → 0.23 s, 0 ms | ready 0.20 → 0.26 s, 0 ms | pass |
| Docker, Aurora's view | ready 0.36 → 0.33 s, 0 ms | ready 1.1 → 0.44 s (FolderView3's folder building no longer runs) | pass |
| Dashboard, Aurora's view | ready 0.19 → 0.22 s, 0 ms | ready 0.43 → 0.25 s, 0 ms | pass |
| VMs, Aurora's view | ready 0.14 → 0.17 s, 0 ms | ready 0.22 → 0.21 s, 0 ms | pass |

Also checked with Unraid's own stylesheets (`UNRAID_WEBGUI`), Black and White: all pages pass.
GitHub Actions ran both checks on GitHub's machines: green.

Fixed on the way (all on `dev`):

- FolderView Plus was not recognised (#23); Aurora drew its own compact list over Plus's folders.
- With Plus, Aurora still redrew its summary above the Docker list on every change of the list;
  Plus watches the whole page, so on a real server this could keep the page busy (reported as a
  hang). With Plus the Docker tab's script does not run at all now, and summaries only redraw
  when a value changes.
- Three page-wide `:has()` rules (Community Applications cards, GPU tile) made every style
  recalculation on busy pages about ten times slower: 300 containers took 4.8 s instead of 2.8 s
  with Plus. Rewritten or limited to their page.
- Aurora's Dashboard grid overrode Plus's own Dashboard layouts; it now steps aside for them.
- Plus's and FolderView3's VM folder rows got Aurora's VM expand chevron and snapshot buttons.
- FolderView3's start-delay field was too narrow (#21).
- With Plus, Aurora's card styling of the Dashboard chips made Plus's chips wider (the last one
  ran under Plus's tile buttons) and hid Plus's folder summary ("6/9 Running"); Aurora's status
  pills made Plus's "12/18 Running" too wide for its folder cell. Both now step aside for Plus's
  own Dashboard layouts and lists (found in the visual review, 6.3).

Open: the hang reported with Plus on a real server is not reproduced on the synthetic host
(section 5, P1).

## 3. Ownership model

Who draws what is decided once per page load, on the server, and never changes while the page is
open. Switching means a reload (Plus's rule, and the only way to keep two renderers from fighting).

| Installed | Docker / VMs tabs | Dashboard tiles | Aurora adds | Aurora never does |
|---|---|---|---|---|
| no folder plugin | Aurora (compact view, groups, filters) | Aurora groups | everything | — |
| FolderView Plus | **Plus** | **Plus** | colours, fonts, layout (`tp-fvplus`) | run its Docker script, take clicks, touch rows, chips or `.folder-storage`, replace `listview` / `loadlist`, write Plus's settings, offer a switch |
| FolderView3, "FolderView" mode | **FolderView3** | **FolderView3** | the view switch, the summary above the Docker list, folder-row tints, a click on a folder row opens it, dividers and app icons on Dashboard folders | its compact view or groups in FolderView3's list, touch `.folder-storage` |
| FolderView3, "Aurora" mode | Aurora | Aurora groups | everything; FolderView3's list takeover is undone (head script in `AuroraTheme.page`) | let FolderView3 draw folders or rewrite the start order from its folders |
| Plus **and** FolderView3 / 2 | FolderView3 (Plus refuses to run) | FolderView3 | as FolderView3 | treat it as Plus |

## 4. Touch points (the inventory)

Every place where Aurora meets a folder plugin. Each one is a risk when either side changes, and
each one is covered by a check.

| Where | What | Plugins | Covered by |
|---|---|---|---|
| `AuroraTheme.page`, detection | plugin folders `folderview.plus`, `folder.view3`, `folder.view2`, `folder.view`; Plus only when no FolderView3 / 2 | both | both checks (`tp-fvplus`, `auroraDockerView`) |
| `AuroraTheme.page`, Aurora view head script | restores `listview` / `loadlist` from `listview_original` / `loadlist_original`; drops FolderView3's Dashboard prefilter (matched by the text `createFolders`); drops its `ajaxComplete` start-order handler (matched by `sync_order.php`); calls `read_autostart.php` / `sync_order.php` for a custom start sequence | FolderView3 | `fv3_compat.mjs`, Aurora view (no folders on all three pages) |
| `enhance.js`, `folderViewActive()` / `folderViewPlus()` | which mode the page is in | both | both checks |
| `enhance.js`, `docker()` | not at all with Plus; FolderView mode: summary, switch, folder-row clicks, tints | both | both checks |
| `enhance.js`, `dashboardContainers()`, `dashboardUpdates()`, `dashboardDockerOrder()` | dialog, update dots, dividers and app icons; none with Plus; never in `.folder-storage` | both | both checks, Dashboard |
| `enhance.js`, `vmDetails()`, `vmGroups()`, `vmViewSwitch()` | VM chevrons (never on folder rows or stored rows), groups only without a folder plugin | both | both checks, VMs |
| `enhance.css` | FolderView3 tints under `:where(:root:not(.tp-fvplus))`, folder-id fix under `.tp-fvplus`, status pills not in Plus's lists (`.tp-enhance:where(:not(.tp-fvplus))`), chip sizes not in Plus's Dashboard layouts, `.tp-docker-loading` | both | checks + screenshots |
| `unraid-tapeory.css` | Dashboard grid and chip card look step aside for Plus's layouts (`data-fv-dashboard-layout` other than `legacy`), FolderView3 settings page styles (`fv3-*`) | both | checks + screenshots |
| page-wide CSS rules | no `:has()` on bare `div` / `td` / `tr`; page-specific rules under `tp-on-<page>` | all pages | `fvplus_compat.mjs` timings |

## 5. Work packages

In order. Each has a definition of done that a check or a person can confirm.

**P1 – Settle the reported hang with Plus (real server).** The synthetic host does not reproduce
it, so it needs data from the server that shows it: with the newest `dev` build, open
`/Docker?aurora=off` (no Aurora at all), then with Page enhancements off (styles only), then
normally, and note load time and whether it hangs; browser console errors; Plus's own diagnostics
(Settings > FolderView Plus > Diagnostics, support bundle).
*Done when* the cause is known; if it is Aurora, it is fixed and the case is added to
`fvplus_host.mjs` so the check catches it from then on.

**P2 – Make the FolderView3 "Aurora view" independent of FolderView3's source text.** The head
script recognises FolderView3's handlers by text in their source (`createFolders`,
`sync_order.php`) and relies on the names `listview_original` / `loadlist_original`. That works
with FolderView3 today (the check proves it) but breaks silently if FolderView3 renames something.
Steps: (a) the check already fails then (no folders allowed in Aurora view); (b) ask the
FolderView3 maintainer for a supported opt-out, e.g. FolderView3 skips its takeover when
`window.FolderView3Disabled === true` or when `<html>` has `tp-aurora-view`; (c) once released,
use it and keep the current code only as a fallback for older FolderView3 versions.
*Done when* Aurora view works through the supported opt-out and the fallback is covered by the
check against the last FolderView3 release without it.

**P3 – Visual review in both themes.** The checks save every page alone and with Aurora, with
Unraid's own stylesheets, Black and White (`SCREENSHOTS`, CI artifact). First review done: Plus's
Dashboard chips and status pills fixed (section 2); FolderView3 looks right in both views.
Still to add: phone width (390 px), and a side-by-side page that shows alone / with Aurora next to
each other for quicker review.
*Done when* the phone width is in the screenshots and the list of visual issues is empty.

**P4 – Plus's settings page and FolderView3's settings page.** Aurora styles FolderView3's
settings page (`fv3-*` rules); Plus's settings page only gets Aurora's general styles. Both load
completely with Aurora (Plus: checked). Add FolderView3's settings page to `fv3_compat.mjs`, and
both settings pages to the screenshot review.
*Done when* both are in the checks and the screenshots.

**P5 – Firefox.** The checks run Chromium. Add Firefox to the check runs (Playwright supports it)
for the steady and settling windows; Firefox's `:has()` and style recalculation differ.
*Done when* both checks pass in Firefox too.

**P6 – Remaining startup cost with Plus.** With 300 containers Aurora's styles add about 0.7 to
1 s once, while the page builds (no lasting cost). Find the next expensive rules the same way as
before (bisecting the stylesheets with the check's timings) and trim them.
*Done when* the difference is under 0.5 s at 300 containers.

**P7 – Coordinate with both maintainers.** Share the checks (they run against the plugins' own
newest code), tell the FolderView Plus maintainer that Aurora now follows the theme contract so
the "turn off Page enhancements" note in their compatibility docs can go, and agree on how each
side announces changes to the touch points in section 4.
*Done when* both maintainers know the checks exist and Plus's docs no longer advise against
Aurora's page enhancements.

## 6. How compatibility is proven

### 6.1 Automated checks (`plugin/test/`)

| File | What |
|---|---|
| `compat_lib.mjs` | loads a page alone and with Aurora (as `AuroraTheme.page` adds it), measures ready time, settling and steady blocking, runs the page's inspection, compares, reports; options `UNRAID_WEBGUI` (Unraid's own stylesheets), `THEME` (black / white), `SCREENSHOTS` (directory), `QUICK=1` (small scenario, one run) |
| `fvplus_host.mjs`, `fvplus_compat.mjs` | FolderView Plus: Docker page from Plus's own benchmark fixture, Dashboard and VMs pages built from Plus's `.page` files on a synthetic Unraid host, Plus's settings page; 90 and 300 containers |
| `fv3_host.mjs`, `fv3_compat.mjs` | FolderView3: Docker, Dashboard and VMs pages built from FolderView3's `.page` files on a synthetic Unraid host; FolderView mode and Aurora view; 90 and 300 containers |

The hosts use Unraid's own list markup (`DockerContainers.php`, `DashboardApps.php`,
`VMMachines.php`), Unraid's `loadlist()` / `listview()` behaviour, Unraid's live values (every
container's CPU and memory every second) and, with `UNRAID_WEBGUI`, Unraid's own stylesheets in
Unraid's order. The plugins run unmodified. Run locally:

```sh
git clone --depth 1 https://github.com/alexphillips-dev/FolderView-Plus.git /tmp/fvp
(cd /tmp/fvp && npm install --no-save jquery@3.7.1)
FVP=/tmp/fvp node plugin/test/fvplus_compat.mjs

git clone --depth 1 https://github.com/chodeus/folder.view3.git /tmp/fv3
(cd /tmp/fv3 && npm install --no-save --no-package-lock jquery@3.7.1)
FV3=/tmp/fv3 node plugin/test/fv3_compat.mjs

# optional: Unraid's stylesheets, White theme, screenshots
git clone --depth 1 https://github.com/unraid/webgui.git /tmp/webgui
UNRAID_WEBGUI=/tmp/webgui THEME=white SCREENSHOTS=/tmp/shots FVP=/tmp/fvp node plugin/test/fvplus_compat.mjs
```

Limits: the hosts model the parts of Unraid the plugins and Aurora use, not all of Unraid; server
time (Docker answering slowly, a large `docker ps`) is not modelled. That is what 6.4 is for.

### 6.2 Continuous checking

`.github/workflows/folderview-compat.yml` runs both checks on every push to `dev` / `main` that
touches the theme or the checks, on pull requests, on demand, and **every Monday against both
plugins' newest code** and Unraid's newest stylesheets, so a change on their side is noticed
within a week even when Aurora did not change. Each run checks Black fully and White quickly and
keeps the screenshots for 30 days. A red run is handled before anything else is released.

### 6.3 Visual review

Screenshots per plugin, page, mode (FolderView3) and theme (Black, White), with and without
Aurora, with Unraid's own stylesheets, from the same checks (locally with `SCREENSHOTS`, in CI as
the `screenshots-fvplus` / `screenshots-fv3` artifacts). Reviewed on every change to the
FolderView styling and before each release that touches it. Look for: text cut off or
overlapping, information of the plugin hidden, controls covered, unreadable colours.

### 6.4 Real servers

Automated checks cannot see a real Docker daemon, real Unraid timing or a real browser cache.
Before a release that touches a touch point, on at least one server per plugin:

1. Install the `dev` build (`https://raw.githubusercontent.com/Tunefish92/Aurora-Theme/dev/Aurora-Theme.plg`).
2. Hard-refresh. Docker tab, Dashboard, VMs tab, the plugin's settings page: folders appear, open
   and close, start / stop from a folder works, no console errors.
3. FolderView3 only: switch to Aurora's view and back; drag a container while unlocked; the start
   order is kept.
4. Leave the Docker tab open for five minutes: no freeze, the browser stays responsive.
5. Black and White theme; a phone.
6. Note Unraid version, plugin version, browser.

Testers: the reporters of #19 / #21 (FolderView3) and #23 (FolderView Plus) offered to test.

## 7. Release gates

A version that touches any touch point in section 4 is released only when:

1. `fvplus_compat.mjs` and `fv3_compat.mjs` pass on `dev` (CI green, also the last Monday run).
2. The visual review (6.3) shows no open issue for the changed pages.
3. The real-server checklist (6.4) passed on at least one server per plugin.
4. The `dev` build was installed by at least one tester for two days without a new problem.

Releases are made from `main` only (`plugin/release.py`); `dev` builds are never offered as
updates: Unraid's update check reads the `release` branch, Aurora's own checks read GitHub
releases. A `dev` build's version is newer than the last release (Unraid installs only newer
versions), so the next release must be newer than every `dev` build handed out.

## 8. Rollback

A tester gets back to the last release, keeping all Aurora settings, with
`plugin install https://raw.githubusercontent.com/Tunefish92/Aurora-Theme/release/Aurora-Theme.plg forced`
in the Unraid terminal. Uninstalling instead would delete Aurora's settings, groups and custom
files. In the browser, `?aurora=off` on any page switches Aurora off for that browser
(`?aurora=on` back), to tell Aurora's problems from others.
