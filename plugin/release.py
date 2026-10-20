#!/usr/bin/env python3
"""Publishes a release: builds Aurora-Theme.plg, commits and tags it, creates the GitHub release
with the .plg attached, and puts the same .plg on the "release" branch.

Unraid's Plugins page checks for updates against the .plg on the "release" branch (PLUGIN_URL
in build.py), so that branch must only ever hold a released .plg; development builds on main
are never offered as updates. Automatic updates and the settings page ask the GitHub releases.

Run from a clean working tree, with the release's CHANGES line already in build.py:
    python3 plugin/release.py notes.md     (notes.md: the GitHub release text, Markdown)
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


if len(sys.argv) != 2 or not pathlib.Path(sys.argv[1]).is_file():
    sys.exit(__doc__)
notes = pathlib.Path(sys.argv[1]).resolve()
if git("rev-parse", "--abbrev-ref", "HEAD") != "main":
    sys.exit("Releases are made from main.")
dirty = [line for line in git("status", "--porcelain").splitlines() if not line.endswith("plugin/build.py")]
if dirty:
    sys.exit("The working tree has changes other than plugin/build.py:\n" + "\n".join(dirty))

version = datetime.datetime.now().strftime("%Y.%m.%d.%H%M")
subprocess.run([sys.executable, str(root / "plugin" / "build.py"), version], check=True)
git("add", PLG, "plugin/build.py")
# AURORA_COMMIT_TRAILER: an optional last line for the commit message, such as a Co-Authored-By.
trailer = os.environ.get("AURORA_COMMIT_TRAILER", "")
git("commit", "-m", f"Release {version}" + (f"\n\n{trailer}" if trailer else ""))
git("push", "origin", "main")

tag = f"v{version}"
subprocess.run(["gh", "release", "create", tag, PLG, "--target", "main",
                "--title", f"Aurora Theme {version}", "--notes-file", str(notes)], cwd=root, check=True)

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
