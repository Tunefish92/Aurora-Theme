# Fake Unraid server: FolderView edge cases

Runs Unraid's real webGui with FolderView Plus or FolderView3 installed, opens each case once with
Aurora off (the cookie `?aurora=off` sets) and once with Aurora on, does the same clicks in both, and
reports what Aurora makes worse.

```sh
git clone --depth 1 -b 7.3 https://github.com/unraid/webgui.git /tmp/webgui
git clone --depth 1 https://github.com/alexphillips-dev/FolderView-Plus.git /tmp/fvp
git clone --depth 1 https://github.com/chodeus/folder.view3.git /tmp/fv3
npm install --no-save --no-package-lock playwright@1.64.1 && npx playwright install --with-deps chromium
sudo -E plugin/test/unraid-sim/run.sh --webgui /tmp/webgui --fvp /tmp/fvp --fv3 /tmp/fv3 --shots /tmp/shots
```

Options: `--only REGEX` (case names), `--shard i/n` (every n-th case, to split a run), `--port`
(default 8080; the server uses it and the next one). Needs Linux, root, PHP 8.3 CLI (with curl,
dom and mbstring), Node 22 and Playwright. Everything runs in its own mount and process
namespace (`unshare`): Unraid's paths there are temporary directories, the machine's own are left
alone. The run exits with 1 when a case fails; `--shots` keeps every step's screenshots, alone and
with Aurora, and `report-<shard>.json`.

## What is real and what is simulated

| Part | Here |
| --- | --- |
| Unraid's pages, scripts, styles, `DockerContainers.php`, `VMMachines.php`, `DashboardApps.php`, `UserPrefs.php`, `UpdateConfig.php`, `Events.php` | Unraid's own code (the webGui checkout), under PHP's built-in server (`router.php` routes as Unraid's nginx does) |
| FolderView Plus, FolderView3 (pages, scripts, PHP endpoints) | their own code, installed from the checkouts |
| Aurora | this working tree, linked in as its `.plg` installs it (`AuroraTheme.page` runs as on a server) |
| Docker | `dockerd.mjs`, the Docker Engine API on `/var/run/docker.sock`, and `docker-cli.sh` for the `docker` commands Unraid runs; start, stop, pause act on its state |
| libvirt | `libvirt_stub.php`, the `libvirt_*` functions Unraid's `Libvirt` class calls, VMs as libvirt domain XML |
| Live values (nchan) | `front.mjs`: `dockerload` every second, as Unraid's `docker_load` publishes |
| Header profile (Unraid Connect) | `myservers2.php`, the markup its web component renders |
| "Docker is busy" | a process named `rc.docker`, which makes Unraid reload the list every 5 s |

`scenario.mjs` writes a case's state: containers (running, paused, stopped, update ready, no
template, 3rd party, compose, long names), VMs, Unraid's Display Settings, Aurora's settings and
groups, the plugin's folders, folder settings and global settings.

## What a case checks (`measure.mjs`)

With Aurora against without, after loading and after every step:

- script errors, page reloads, requests repeated more often (a reload loop);
- containers and folders listed and shown;
- text cut off (no "…"), controls covered by something else or out of reach;
- the page wider than the window, a table cut off;
- time the browser is blocked (loading, settling, live updates, each step);
- with `files: true`, what was saved on the server: Unraid's container and VM order, the autostart
  list and waits, the plugins' order, folder and start-order files.

A step that fails without Aurora too (the plugin still busy) is not compared. A case can allow
more blocked time per step (`blockedFactor`, `blockedAllowance`); only FolderView3's two largest
cases do, for its known style cost (see `cases.mjs` and the compatibility plan, section 2.1).

The cases (`cases.mjs`) cover both plugins with one setting changed at a time: container and folder
counts, the plugins' preview, layout, page view, theme, refresh, performance and start-order
settings, Aurora's layout, enhancements, theme, accent and font, Unraid's theme, listing height,
width, font size, number format and Advanced View, phone, tablet and wide windows, the Docker, VMs
and Dashboard pages, the plugins' settings pages and folder editor, and the clicks: open and close
folders, expand all, menus, previews, start and stop, sort, autostart, waits.
