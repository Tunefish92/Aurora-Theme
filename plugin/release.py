#!/usr/bin/env python3
"""Publishes a release: builds Aurora-Theme.plg, commits and tags it, creates the GitHub release
with the .plg attached, and puts the same .plg on the "release" branch.

Unraid's Plugins page checks for updates against the .plg on the "release" branch (PLUGIN_URL
in build.py), so that branch must only ever hold a released .plg; development builds on main
are never offered as updates. Automatic updates and the settings page ask the GitHub releases.

Run from a clean working tree, with the release's CHANGES line already in build.py:
    python3 plugin/release.py notes.md     (notes.md: the GitHub release text, Markdown)

Dev builds, for users who chose the "dev" update channel, are made from the dev branch:
    python3 plugin/release.py --dev notes.md
Their version ends in "-dev", they are GitHub pre-releases (so "latest" and the stable channel
never see them), and the "release" branch is left alone.
"""
import datetime
import os
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
PLG = "Aurora-Theme.plg"
BRANCH = "release"


def git(*args, text_input=None):
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True,
                          input=text_input).stdout.strip()


args = sys.argv[1:]
dev = "--dev" in args
args = [arg for arg in args if arg != "--dev"]
if len(args) != 1 or not pathlib.Path(args[0]).is_file():
    sys.exit(__doc__)
notes = pathlib.Path(args[0]).resolve()
branch = "dev" if dev else "main"
if git("rev-parse", "--abbrev-ref", "HEAD") != branch:
    sys.exit(f"{'Dev builds' if dev else 'Releases'} are made from {branch}.")
dirty = [line for line in git("status", "--porcelain").splitlines() if not line.endswith("plugin/build.py")]
if dirty:
    sys.exit("The working tree has changes other than plugin/build.py:\n" + "\n".join(dirty))

version = datetime.datetime.now().strftime("%Y.%m.%d.%H%M") + ("-dev" if dev else "")
subprocess.run([sys.executable, str(root / "plugin" / "build.py"), version], check=True)
git("add", PLG, "plugin/build.py")
# AURORA_COMMIT_TRAILER: an optional last line for the commit message, such as a Co-Authored-By.
trailer = os.environ.get("AURORA_COMMIT_TRAILER", "")
git("commit", "-m", f"{'Dev build' if dev else 'Release'} {version}" + (f"\n\n{trailer}" if trailer else ""))
git("push", "origin", branch)

tag = f"v{version}"
subprocess.run(["gh", "release", "create", tag, PLG, "--target", branch, *(["--prerelease"] if dev else []),
                "--title", f"Aurora Theme {version}", "--notes-file", str(notes)], cwd=root, check=True)
if dev:
    print(f"Dev build {version}: GitHub pre-release {tag}, offered to servers on the dev update channel.")
    sys.exit(0)

# The "release" branch: one commit per release, holding only the released .plg. Built with git
# plumbing, so the working tree and main stay as they are.
blob = git("hash-object", "-w", PLG)
tree = git("mktree", text_input=f"100644 blob {blob}\t{PLG}\n")
remote = git("ls-remote", "--heads", "origin", BRANCH).split()
parent = ["-p", remote[0]] if remote else []
if remote:
    git("fetch", "origin", BRANCH)
commit = git("commit-tree", tree, *parent, "-m", f"Release {version}")
git("push", "origin", f"{commit}:refs/heads/{BRANCH}")
print(f"Released {version}: GitHub release {tag}, and the {BRANCH} branch serves it to Unraid's update check.")
