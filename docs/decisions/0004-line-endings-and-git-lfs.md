# 0004. Line endings and large files follow Lens Studio's Git rules

Date: 2026-11-18 · Status: accepted

## Context

When the project folder is a git repository, Lens Studio writes a managed block at the top of `.gitattributes` (and of `.gitignore`). The `.gitattributes` block does four things:

- sends every file under `Assets/` and `Packages/` through **Git LFS**, except the text types listed below;
- forces `text eol=lf` for known text types (scripts, YAML, JSON, Markdown, `.meta` files and so on);
- marks `.esproj` files as YAML;
- assigns a custom YAML merge driver (`lens-studio-yaml-merge`) to Lens Studio's asset types.

Two details matter on this machine:

- Git for Windows ships with `core.autocrlf=true`. Lens Studio's block only forces LF for files under `Assets/` and `Packages/`, so root-level text files (`AGENTS.md`, `TrafficInsight.esproj`) would be converted to CRLF on a Windows checkout. Every file Lens Studio writes uses LF.
- Git LFS (3.8.0) is installed and its filters are configured system-wide, but **uploading** the large files on `git push` is done by a per-repository `pre-push` hook. Without that hook, a push sends only the small pointer files and the real content never reaches the remote.

## Decision

- Leave Lens Studio's managed blocks alone, and keep our additions below them.
- Add a small, path-specific block that keeps the other text files on LF (`/*.md`, `/*.json`, `/*.esproj`, `/.gitignore`, `/.gitattributes`, `docs/`, `devpost/`, `.claude/`).
- Do not add a catch-all such as `* text=auto`. It would switch text conversion back on for the LFS-tracked files.
- Run `git lfs install --local` in every clone, so the `pre-push` hook is present.

## Consequences

- The large files (`Echopark.hdr` and the four `.lspkg` packages, about 6.6 MB) are stored in LFS. GitHub's free LFS storage and bandwidth quotas apply, so check its current limits before adding large assets.
- A ZIP download from GitHub contains pointer files, not the real assets. Snap's Base Template notes say the same: "Clone with Git LFS; a ZIP download will not work."
- Screenshots and GIFs in `docs/media/` are outside Lens Studio's rules and are stored as ordinary git objects.
- Git never rewrites the bytes Lens Studio wrote, so a diff shows real changes.
- Windows tools that insist on CRLF will see LF files. None are used here.
