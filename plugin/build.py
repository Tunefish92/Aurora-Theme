#!/usr/bin/env python3
"""Builds Aurora-Theme.plg, a self-contained Unraid plugin file.

Every plugin file is written by a bash heredoc inside the .plg, so installing needs no
downloads. Run: python3 plugin/build.py [version]   (version defaults to the current date and time)
"""
import base64
import datetime
import os
import pathlib
import shutil
import sys
from xml.sax.saxutils import escape

NAME = "Aurora-Theme"
AUTHOR = "Tunefish"
# GitHub repository: updates are checked there and the settings page opens issues there.
GITHUB_REPO = "Tunefish92/Aurora-Theme"
# Unraid's Plugins page downloads this file on every visit to see whether an update is out. It is
# the newest release's .plg on the "release" branch, which plugin/release.py updates with each
# GitHub release and nothing else touches. raw.githubusercontent.com answers in one request
# from a CDN. The releases' "latest/download" address took two redirects through github.com,
# and as Unraid's wget does not retry HTTP errors, any hiccup there showed as "not available".
PLUGIN_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/release/{NAME}.plg"
SUPPORT_URL = f"https://github.com/{GITHUB_REPO}/issues"
MIN_UNRAID = "7.2.0"
EMHTTP = f"/usr/local/emhttp/plugins/{NAME}"
DELIMITER = "AURORA_THEME_EOF"

root = pathlib.Path(__file__).resolve().parent
src = root / "src"
# Unraid refuses to install a version that is not newer than the installed one, and compares
# versions as text, so the default carries the time and every rebuild counts as an update.
# A dev build's version ends in "-dev" (plugin/release.py --dev): the plugin then shows a "Dev"
# badge in the top bar, and its update check knows the dev channel installed it.
version = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime("%Y.%m.%d.%H%M")

# Installed path -> source file. The theme stylesheet lives at the repo root so it can also be
# pasted into a browser extension for quick experiments.
files = {str(path.relative_to(src)): path for path in sorted(src.rglob("*")) if path.is_file()}
files["styles/theme.css"] = root.parent / "unraid-tapeory.css"

# The plugin was called Tunefish-Future-Theme before. If that one is installed, its settings,
# Docker groups, custom files and statistics move over, and it is removed, so the two never run
# side by side (both would load their theme and claim the Stats tab).
MIGRATE_OLD_NAME = r"""
OLD=Tunefish-Future-Theme
if [ -e /boot/config/plugins/$OLD.plg ] || [ -d /usr/local/emhttp/plugins/$OLD ]; then
  for f in $OLD.cfg docker-groups.json favourites.json custom.css custom.js; do
    src=/boot/config/plugins/$OLD/$f
    dst=/boot/config/plugins/@NAME@/${f/$OLD/@NAME@}
    if [ -f "$src" ] && [ ! -f "$dst" ]; then cp "$src" "$dst"; fi
  done
  if [ -d /var/lib/tunefish-future-theme ] && [ ! -d /var/lib/aurora-theme ]; then
    mv /var/lib/tunefish-future-theme /var/lib/aurora-theme
  fi
  rm -rf /usr/local/emhttp/plugins/$OLD /boot/config/plugins/$OLD /var/lib/tunefish-future-theme
  rm -f /boot/config/plugins/$OLD.plg /var/log/plugins/$OLD.plg
  echo "Settings moved over from $OLD, which has been removed."
fi
""".strip().replace("@NAME@", NAME)

# A version change (automatic update, "Update now", the Plugins page, also back to an older
# release) is noted in updated.json for the "Aurora Theme updated" dialog on the next page
# (include/updated.php, scripts/updated.js). Unraid copies the new .plg to the flash drive only
# after this script, so the .plg there is still the previous version; at boot both are the same
# and nothing is noted. Several updates before the dialog was seen keep the first "from".
MARK_UPDATED = r"""
old=$(sed -n 's/^[[:space:]]*version="\([^"]*\)".*/\1/p' /boot/config/plugins/@NAME@.plg 2>/dev/null | head -n 1)
if [[ "$old" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}[A-Za-z0-9._-]*$ && "$old" != "@VERSION@" ]]; then
  from=$(sed -n 's/.*"from":"\([^"]*\)".*/\1/p' /boot/config/plugins/@NAME@/updated.json 2>/dev/null)
  [[ "$from" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}[A-Za-z0-9._-]*$ ]] || from=$old
  printf '{"from":"%s","to":"%s","time":%s}\n' "$from" "@VERSION@" "$(date +%s)" > /boot/config/plugins/@NAME@/updated.json
fi
""".strip().replace("@NAME@", NAME).replace("@VERSION@", version)

install = [
    f"rm -rf {EMHTTP}",
    f"mkdir -p {EMHTTP}/styles {EMHTTP}/scripts {EMHTTP}/include {EMHTTP}/fonts /boot/config/plugins/{NAME}",
    MIGRATE_OLD_NAME,
    MARK_UPDATED,
]
BINARY = {".woff2", ".woff", ".png", ".svg"}
for target, path in sorted(files.items()):
    if path.suffix in BINARY:
        # Fonts and images travel base64-encoded and are decoded on the server.
        encoded = base64.encodebytes(path.read_bytes()).decode("ascii")
        install.append(f"base64 -d > {EMHTTP}/{target} <<'{DELIMITER}'\n{encoded}{DELIMITER}")
        continue
    text = path.read_text(encoding="utf-8").replace("@@GITHUB_REPO@@", GITHUB_REPO).replace("@@VERSION@@", version)
    if not text.endswith("\n"):
        text += "\n"
    for forbidden in ("]]>", DELIMITER):
        if forbidden in text:
            sys.exit(f"{path}: contains {forbidden!r}, which would break the .plg")
    install.append(f"cat > {EMHTTP}/{target} <<'{DELIMITER}'\n{text}{DELIMITER}")
# Earlier versions remembered the install location for updates; updates now come from GitHub.
FORGET_SOURCE = f"rm -f /boot/config/plugins/{NAME}/update-source"

# Login page: Unraid's login and first-password pages get one line that includes
# include/login-head.php before </head>. The files live in RAM, so this runs at every boot
# (Unraid reinstalls plugins then); the line does nothing once the plugin file is gone.
LOGIN_HOOK = r"""
for page in /usr/local/emhttp/plugins/dynamix/include/.login.php /usr/local/emhttp/plugins/dynamix/include/.set-password.php; do
  [ -f "$page" ] || continue
  grep -q '@NAME@/include/login-head.php' "$page" && continue
  grep -q '</head>' "$page" || continue
  sed -i '0,/<\/head>/s##<?php @include "/usr/local/emhttp/plugins/@NAME@/include/login-head.php"; ?>\n</head>#' "$page"
done
""".strip().replace("@NAME@", NAME)

install += [
    FORGET_SOURCE,
    LOGIN_HOOK,
    f"find {EMHTTP} -type d -exec chmod 755 {{}} +",
    f"find {EMHTTP} -type f -exec chmod 644 {{}} +",
    f"chmod 755 {EMHTTP}/scripts/collect.php {EMHTTP}/scripts/autoupdate.php {EMHTTP}/scripts/schedule.php",
    "# Unraid builds the crontab from the .cron files in each plugin's folder on the flash drive.",
    f"cat > /boot/config/plugins/{NAME}/stats.cron <<'{DELIMITER}'\n"
    "# Aurora Theme: one statistics sample per minute\n"
    f"* * * * * /usr/bin/php {EMHTTP}/scripts/collect.php &> /dev/null\n\n{DELIMITER}",
    # Automatic updates at the time chosen on the settings page; this also reloads the crontab.
    f"/usr/bin/php {EMHTTP}/scripts/schedule.php",
    'echo ""',
    f'echo "{NAME} {version} is installed."',
    'echo "Settings: Settings > User Utilities > Aurora Theme"',
    'echo ""',
]

plg = f"""<?xml version='1.0' standalone='yes'?>
<!DOCTYPE PLUGIN>

<PLUGIN name="{NAME}"
        author="{escape(AUTHOR)}"
        version="{version}"
        launch="Settings/AuroraThemeSettings"
        pluginURL="{PLUGIN_URL}"
        support="{SUPPORT_URL}"
        icon="paint-brush"
        min="{MIN_UNRAID}">

<CHANGES>
###{version}
- New colours, fonts, tables, buttons, dialogs and notification panel for the Black and White themes.
- Optional sidebar navigation layout.
- Page enhancements: brand and server card in the sidebar, slim top bar, page headings, status pills, Docker summary and filters.
- Own Stats page with a built-in collector, replacing Dynamix System Statistics.
- Docker application groups, compact container list, restyled switches and menus.
- Updates from the GitHub releases: "Check for updates" and "Update now" on the settings page, and automatic updates (on by default, weekly).
- Redesigned Main, Users, VMs and login page; live port check in the Docker editor; dark / light switch.
- Redesigned top bar, Apps tab, tool pages, help boxes and notices; the processor tile shows its cores as a compact grid.
- Phone layout fixes across the webGUI: Dashboard tiles, wide tables, VM editor, Apps, header and pop-ups.
- Plugins page: a plugin whose update check failed for a moment ("not available") is checked again; Aurora's own check needs a single request.
- Choose when automatic updates run (hourly, daily or weekly at a set time); redesigned GPU Statistics tile.
- GPU tile: an idle GPU's clock reads "idle"; NVIDIA and AMD rows tidied.
- Docker page loads much faster with many containers, with a loading status; array usage widget; custom banner and header colours shown; Display Settings fixes.
- FolderView support with an Aurora / FolderViewPlugin switch; groups on the Dashboard with app icons and CPU / RAM sums; VM usage cards, accent colour, phone fixes.
- Containers keep Unraid's order and start in the order they are listed: drag them within and between groups, and move whole groups while the list is unlocked. VM groups on the VMs tab and the Dashboard, a buttons column on the VMs tab, group icons that open the app's menu and show stopped apps too. The sidebar can be hidden. FolderView3: the view switch on the VMs tab as well, drag to the top of the list, its autostart sequence respected, a tidier settings page. Fixes for long names on phones, the updates count and the server card.
- Top layout: with the array usage indicator on, Stats and Tools are back in the menu; the indicator sits in the top bar on wide screens.
- New "Fonts" setting: Aurora's Inter and Space Grotesk, or Unraid's own Clear Sans.
- Dark / light switch: only the theme setting in dynamix.cfg is changed, and settings lost while the Unraid API rewrites the file are put back (two quick switches could empty it).
- With "Favorites enabled" set to No in Display Settings, Unraid's Favorites tab is hidden too.
- Docker start delay ("wait") field wide enough for its number in FolderView3's view.
- An orange dot on a container's icon when an update is ready, running or not: on the Dashboard, in group and folder icons and in the Docker tab's compact list. A stopped container with an update stays on the Dashboard when stopped containers are hidden.
- FolderView Plus support: with it installed, its folders arrange the Docker and VMs tabs and the Dashboard, and Aurora keeps to colours and layout (no view switch).
- After an update, the next page shows "Aurora Theme updated" with the new version and its release notes; automatic updates also show an Unraid notification. Automatic updates are checked weekly by default.
- Docker and VMs tabs with FolderView3 or FolderView Plus: a "beta" note in the top bar; their support still has compatibility issues and is being worked on. With both installed, a warning that this is not supported (also on the Dashboard and the Plugins page).
- Phones: pages fit the screen width exactly; the "back to top" / "to the end" buttons no longer let the page be pushed sideways.
- Faster on busy pages: style rules that the browser checked again on every change of any page (Community Applications cards, GPU tile) are limited to their page or replaced.
- FolderView Plus: long container, VM and folder names end in "..." inside their chips and name boxes. Dashboard Array and pool tiles keep their columns in one row; on phones the status column has room for "standby".
- Update channel: "Dev builds (testing)" also installs the dev builds published between releases; an "Aurora Dev" badge in the top bar shows when one is installed, and "Install stable" goes back to the stable release.
- "Aurora Theme updated" dialog: after skipping versions, it lists the notes of every release since the previous version, newest first, each with its date.
- Docker tab and Dashboard: a container updated in the background (CA Auto Update, "Update All" in another tab, the scheduled check) no longer shows "update ready" until the page is reloaded; the list is loaded again within 20 seconds.
- Docker tab (Aurora view): images no container uses ("orphan image") are collected in an "Orphans" section at the end of the list, also in the basic view, with a "Remove all" button.
- Docker tab on phones: each container's card also shows its addresses and its mounts (#27).
- Phones: dialogs fit the part of the screen the browser leaves visible, so the Done button of a container update and the buttons of long dialogs no longer end up behind the browser's bars; long texts scroll between the title and the buttons.
</CHANGES>

<!-- Install: write all plugin files. Generated by plugin/build.py; edit the sources, not this file. -->
<FILE Run="/bin/bash">
<INLINE>
<![CDATA[
{chr(10).join(install)}
]]>
</INLINE>
</FILE>

<!-- Remove: delete the plugin files and its settings, including custom.css and custom.js. -->
<FILE Run="/bin/bash" Method="remove">
<INLINE>
<![CDATA[
rm -rf {EMHTTP}
for page in /usr/local/emhttp/plugins/dynamix/include/.login.php /usr/local/emhttp/plugins/dynamix/include/.set-password.php; do
  [ -f "$page" ] && sed -i '\\#{NAME}/include/login-head.php#d' "$page"
done
rm -rf /boot/config/plugins/{NAME}
rm -rf /var/lib/aurora-theme
/usr/local/sbin/update_cron
echo ""
echo "{NAME} has been removed."
echo ""
]]>
</INLINE>
</FILE>

</PLUGIN>
"""

out = root.parent / f"{NAME}.plg"
out.write_text(plg, encoding="utf-8")
print(f"wrote {out} ({len(plg)} bytes, {len(files)} files, version {version})")

# Also drop the build on the server's share (mounted here), from where it is installed.
# AURORA_DEPLOY overrides the folder; set it to an empty value to skip the copy.
deploy = os.environ.get("AURORA_DEPLOY", "/mnt/filesharing/unraid")
if deploy and pathlib.Path(deploy).is_dir():
    target = pathlib.Path(deploy) / out.name
    shutil.copyfile(out, target)
    print(f"copied to {target}")
elif deploy:
    print(f"not copied: {deploy} is not available")
