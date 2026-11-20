# Open work

## FolderView edge cases: two cases red in CI

- **Status:** open, not investigated. Red on main for releases 2026.11.12.1759, 2026.11.14.1944 and 2026.11.17.1926 (released anyway; the FolderView compatibility checks themselves pass).
- **Reported:** CI, workflow "FolderView edge cases" (`plugin/test/unraid-sim`).
  - `fv3 overflow scroll`: "[advanced view] 1 state pills past their column: span.state "paused"". First red on dev ae587fd (2026-11-12, the #37 Compose status change); last green e633868 / ff79e2f (2026-11-11).
  - `plus folder settings`: "[loaded] 1 controls outside the window: span.state.folder-state "6/6 stopped"". First red on dev ff103f8 (2026-11-14, #38 merge); could also be a FolderView Plus change upstream, since CI runs its newest code.
- **Cause:** unknown. The #37 change (`stateParts()`, Status pill text) is the first suspect for the first case.
- **Plan:** run `plugin/test/unraid-sim/run.sh --only 'overflow scroll|folder settings'` locally, compare with the run on e633868 and with FolderView Plus at its commit from 2026-11-11.
- **Done when:** both cases pass on dev in CI.

## Group icons for Docker and VM groups (#40)

- **Status:** built on `feature/group-icons` (not committed yet); open: the checks below that need a server.
- **Reported:** #40 (bfox135, 2026-11-20): FolderView lets each folder have an icon; Aurora's groups should too.
- **Plan:**
  - [x] `group.icon` in docker-groups.json / vm-groups.json: `fa-<name>`, a local image path (a container's or VM's icon), or `upload:<sha1>.<ext>`; validated in docker-groups.php, unknown values dropped.
  - [x] include/group-icons.php + GroupIconsLib.php: upload from the PC or fetch from a URL (server side, http/https only, 1 MB, PNG/JPEG/GIF/WebP checked by content, no SVG), stored in /boot/config/plugins/Aurora-Theme/group-icons/, served with nosniff and a sandbox CSP; unused files pruned.
  - [x] Picker on the Docker and VMs tabs (picture button in the group header): icons on the page, symbols, upload, URL, default.
  - [x] Icon in the tab headers and the Dashboard group chips.
  - [x] Tests: group_icons_lib.php (PHP 8.3), group_icons.mjs (FV3 host pages, Black + White, phone width), both in CI; CHANGES line, README.
  - [ ] On the test VM: Unraid's CSRF check on the multipart upload, nginx/PHP upload limits, fetching from the VM, the real Docker and VMs tabs (needs array + Docker; the trial is expired).
  - [ ] Sidebar layout and a real phone (only the top layout and a 390 px window were checked).
- **Done when:** a group's icon can be set from all four sources on both tabs, shows on the tabs and the Dashboard in Black and White, top and sidebar, at phone width, and survives a reload.
