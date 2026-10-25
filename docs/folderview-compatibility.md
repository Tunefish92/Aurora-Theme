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

**FolderView3** (newest code, main of 2026-10-24; with Unraid's own stylesheets, Black)

| Page, mode | 90 containers / 24 VMs | 300 containers / 60 VMs | Result |
|---|---|---|---|
| Docker, FolderView mode | ready 0.39 → 0.43 s, settling 52 → 198 ms, steady 0 ms | ready 1.25 → 1.27 s, settling 406 → 651 ms, steady 0 ms | pass |
| Dashboard, FolderView mode | ready 0.28 → 0.37 s, 0 ms | ready 0.54 → 0.57 s, 0 ms | pass |
| VMs, FolderView mode | ready 0.22 → 0.23 s, 0 ms | ready 0.23 → 0.28 s, 0 ms | pass |
| Docker, Aurora's view | ready 0.36 → 0.31 s, 0 ms | ready 1.07 → 0.41 s, settling 426 → 0 ms (FolderView3's folder building no longer runs) | pass |
| Dashboard, Aurora's view | ready 0.30 → 0.24 s, 0 ms | ready 0.52 → 0.37 s, 0 ms | pass |
| VMs, Aurora's view | ready 0.23 → 0.22 s, 0 ms | ready 0.22 → 0.24 s, 0 ms | pass |

Also checked with Unraid's own stylesheets (`UNRAID_WEBGUI`), Black and White: all pages pass.
GitHub Actions ran both checks on GitHub's machines, with Unraid's stylesheets, Black and White:
green since 476eeb8 (the two runs before it caught the FolderView3 restyle cost fixed there).

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
- FolderView3 measures its column widths by moving each folder's rows into the table and back.
  With Aurora every move restyled about 1,600 elements instead of about 200: the Docker page in
  FolderView mode stayed busy 0.8 s instead of 0.2 s after its folders appeared (300 containers,
  CI with Unraid's stylesheets). Causes, found by bisecting the stylesheet by restyled elements:
  `:last-of-type` as an ancestor in the top bar's and sidebar's `#UserProfile` rules (now
  `div ~ div`, the same element in Unraid's profile), and the page-wide `::selection` rule (no
  longer matched inside the Docker and VM lists; Chrome passes the colour down to them).
- With Plus, Aurora's card styling of the Dashboard chips made Plus's chips wider (the last one
  ran under Plus's tile buttons) and hid Plus's folder summary ("6/9 Running"); Aurora's status
  pills made Plus's "12/18 Running" too wide for its folder cell. Both now step aside for Plus's
  own Dashboard layouts and lists (found in the visual review, 6.3).

### 2.1 Edge cases on Unraid's real webGui

`plugin/test/unraid-sim/` (section 6.1) runs Unraid's own webGui (7.2 and 7.3) with each plugin
installed from its newest code and goes through one setting or click at a time, alone and with
Aurora: container and folder counts (none, one, 40 folders of one, 300 in 30, empty folders, long
names, nested folders, all stopped, Docker busy), the plugins' preview, layout, page view, theme,
refresh, performance, column and start-order settings, Aurora's layout, enhancements, theme, accent
and font, Unraid's theme, listing height, width, font size, number format and Advanced View, phone,
tablet and wide windows, the Docker, VMs and Dashboard pages (every Dashboard layout of Plus), the
plugins' settings pages and folder editor, and the clicks: open and close folders, expand all,
menus, previews, start and stop, sort, autostart, waits.

Full run on Unraid 7.3 with every fix below: 109 of 110 cases as without Aurora. The one left,
FolderView3 with Docker busy (its list rebuilt every 5 s), came from Aurora's help button
re-checking the whole page after every rebuild; fixed, it passes in five runs out of five.

Sorting and the start order, compared by the files saved on the server (Unraid's container and VM
order, autostart list and waits, the plugins' order, folder and start-order files), identical
alone and with Aurora:

- FolderView3: dragging containers and folders on the Docker page (unlocked), autostart on and
  off, its Autostart tab (drag, position, wait, Apply), its custom start sequence in FolderView
  mode and in Aurora's view, VM sorting and autostart.
- FolderView Plus: dragging on the Docker page, autostart, reordering in its settings table, its
  start-order modes (unmanaged, Docker page, custom batches), VM sorting and autostart.
- Aurora's view saves the same order as Unraid without any plugin.

Found and fixed (all on `dev`):

- **Plus with many containers never finished loading with Aurora.** Two VM editor rules asked
  `form:has(#domain_name)` and `textarea[style*="none"]`; Chrome then rechecked every table cell
  of every page on each restyle: 2.5 million cells while Plus built 300 containers (half a minute,
  then still busy), seven seconds for Plus's Advanced View on a phone. Now found by the form's id
  and Unraid's "Inline XML" switch. Plus's 300-container page now loads in the same time with and
  without Aurora (about 38 s, Plus's own time, see below). This is the likely cause of the hang
  reported with Plus on a real server (P1).
- Further rules of the same kind, each making list rebuilds re-check cells all over the page:
  Disk Location's bay colours (`div:has(.green-orb-disklocation)`, now `data-tp-orbs` set by
  `enhance.js`), the Dashboard app grid (`td:has(> span.outer.solid)`, now Unraid's `tr.updated`
  row) and section rows on tool pages (`td[style*="bold"] ~ td`, now `tr.tp-section-row` set by
  `enhance.js`). Together they doubled the restyle work of every Docker list reload with Plus
  (every 5 s while Docker is busy).
- FolderView3: saved from Aurora's view, FolderView3's own order snapshot (`update_order.php`)
  lost the folders' places, and after switching back to FolderView mode every folder stood at the
  top. Aurora's view no longer runs that FolderView3 handler.
- FolderView3: long container names in a folder were cut off mid-letter (now end in "…"); the
  "Volume Mappings (App to Host)" heading ran into "Autostart" next to the sidebar (now ends in
  "…").
- Plus: Aurora's "to top / to end" arrows covered Plus's Tools button at the end of the Docker
  list (they now sit in the footer); its Dashboard chips stacked their name under the icon and
  ran under Plus's quick buttons; next to a wide preview its folder status ("7/7 stopped") ran
  past Plus's narrow name box, cut off mid-letter (Plus's layout, Aurora's font made it more
  likely), and now ends in "…" in the same room.
- Aurora's help button looked for help boxes in the whole page after every change, also each
  list rebuild; it now skips changes inside tables and only touches the button when the answer
  changes (FolderView3 with Docker busy: Aurora's script time 64 → 14 ms per 15 s).

Measured, not Aurora's to fix:

- FolderView3 restyles every row it opens or rebuilds, and with Aurora's rules each row takes
  about twice as long to style. The cost is spread over the whole stylesheet (bisected: no rule or
  group of rules carries it). Opening 40 folders one by one: 1.5 s of style work in all instead of
  0.7 s (about 20 ms more per folder); opening all of 300 containers: about 13 s instead of 6 s.
- FolderView Plus with 300 containers takes about 38 s to build its Docker page and about 27 s
  of CPU for "Expand all", with or without Aurora (to pass on to Plus's maintainer, P7).

Open: the hang reported with Plus on a real server is not reproduced on the synthetic hosts; the
VM editor rule above is the likely cause (section 5, P1).

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
| `AuroraTheme.page`, Aurora view head script | restores `listview` / `loadlist` from `listview_original` / `loadlist_original`; drops FolderView3's Dashboard prefilter (matched by the text `createFolders`) and its order prefilter (matched by `update_order.php`); drops its `ajaxComplete` start-order handler (matched by `sync_order.php`); calls `read_autostart.php` / `sync_order.php` for a custom start sequence | FolderView3 | `fv3_compat.mjs`, Aurora view (no folders on all three pages) |
| `enhance.js`, `folderViewActive()` / `folderViewPlus()` | which mode the page is in | both | both checks |
| `enhance.js`, `docker()` | not at all with Plus; FolderView mode: summary, switch, folder-row clicks, tints | both | both checks |
| `enhance.js`, `dashboardContainers()`, `dashboardUpdates()`, `dashboardDockerOrder()` | dialog, update dots, dividers and app icons; none with Plus; never in `.folder-storage` | both | both checks, Dashboard |
| `enhance.js`, `vmDetails()`, `vmGroups()`, `vmViewSwitch()` | VM chevrons (never on folder rows or stored rows), groups only without a folder plugin | both | both checks, VMs |
| `enhance.css` | FolderView3 tints under `:where(:root:not(.tp-fvplus))`, folder-id fix under `.tp-fvplus`, status pills not in Plus's lists (`.tp-enhance:where(:not(.tp-fvplus))`), chip sizes not in Plus's Dashboard layouts, `.tp-docker-loading` | both | checks + screenshots |
| `unraid-tapeory.css` | Dashboard grid and chip card look step aside for Plus's layouts (`data-fv-dashboard-layout` other than `legacy`), FolderView3 settings page styles (`fv3-*`) | both | checks + screenshots |
| page-wide CSS rules | no `:has()` on bare `div` / `td` / `tr` / `form`, and none whose last part is a bare tag (`td`); no `[style*=…]` inside `:has()` or before a combinator (`~`, `+`, ` `); no `:last-of-type`, `:nth-*` or `*-of-type` in an ancestor part of a selector whose last part is a bare tag; no `::selection` inside `#docker_list` / `#kvm_list`; page-specific rules under `tp-on-<page>`; where markup alone cannot tell, `enhance.js` marks the element (`data-tp-orbs`, `tp-section-row`) | all pages | both checks' timings, edge-case runs |

## 5. Work packages

In order. Each has a definition of done that a check or a person can confirm.

**P1 – Settle the reported hang with Plus (real server).** The synthetic host does not reproduce
it, so it needs data from the server that shows it: with the newest `dev` build, open
`/Docker?aurora=off` (no Aurora at all), then with Page enhancements off (styles only), then
normally, and note load time and whether it hangs; browser console errors; Plus's own diagnostics
(Settings > FolderView Plus > Diagnostics, support bundle).
*Done when* the cause is known; if it is Aurora, it is fixed and the case is added to
`fvplus_host.mjs` so the check catches it from then on.
Likely found (section 2.1): on Unraid's real webGui, Plus's Docker page with 300 containers never
finished loading with Aurora because of two VM editor rules that made Chrome recheck every table
cell on each restyle. Fixed on `dev`; the edge-case runs keep the case (`plus 300 containers in
30 folders`). Still to confirm on the server that reported it.

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

**P6 – Remaining startup cost.** With 300 containers Aurora's styles add about 0.7 to 1 s once
with Plus while the page builds, and about 0.25 s of busy time with FolderView3's width
measuring (no lasting cost in either). Find the next expensive rules the same way as before:
bisect the stylesheets by the number of elements each restyle touches (Chrome's trace,
`UpdateLayoutTree` `elementCount`), which is more exact than timings, and trim them. Add a check
that the per-restyle element count with Aurora stays within 1.5 times the plugin's own.
*Done when* the difference is under 0.5 s at 300 containers and the element-count check is in
both checks.

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

**Edge cases on Unraid's real webGui (`plugin/test/unraid-sim/`).** A fake Unraid server: Unraid's
own webGui checkout under PHP's built-in server (routed as Unraid's nginx does), a fake Docker
Engine API and `docker` command, a fake libvirt, Unraid's live channels, and the plugins installed
from their checkouts, all in a private mount and process namespace. `cases.mjs` holds about 110
cases (section 2.1), each opened alone and with Aurora with the same clicks; `measure.mjs` compares
script errors, reloads, repeated requests, containers and folders listed and shown, text cut off,
controls covered or out of reach, page and table overflow, blocked time per step and, for sorting
and start order, the files saved on the server. See its `README.md`:

```sh
sudo -E plugin/test/unraid-sim/run.sh --webgui /tmp/webgui --fvp /tmp/fvp --fv3 /tmp/fv3 --shots /tmp/shots
```

### 6.2 Continuous checking

`.github/workflows/folderview-compat.yml` runs both checks on every push to `dev` / `main` that
touches the theme or the checks, on pull requests, on demand, and **every Monday against both
plugins' newest code** and Unraid's newest stylesheets, so a change on their side is noticed
within a week even when Aurora did not change. Each run checks Black fully and White quickly and
keeps the screenshots for 30 days. A red run is handled before anything else is released.

`.github/workflows/folderview-edge-cases.yml` runs the edge cases (6.1) the same way, on Unraid's
webGui 7.3 and both plugins' newest code, split over four machines, and keeps each step's
screenshots and the reports.

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
