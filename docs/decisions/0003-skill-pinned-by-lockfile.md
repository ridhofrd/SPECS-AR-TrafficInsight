# 0003. The plan-lens skill is pinned by a lockfile, not committed

Date: 2026-11-18 · Status: accepted

## Context

The hackathon requires the project to be planned with Devpost's `plan-lens` skill. The page's install command is `npx skills add challengepost/learn-specs --all -y`. The installer's documentation says `--all` installs all skills to all supported agents without prompts, and that it collects anonymous usage data unless `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` is set. On Windows, symlinks (the installer's default) need Developer Mode or admin rights.

## Decision

Install only what is used, with telemetry off:

```text
DISABLE_TELEMETRY=1 npx skills add challengepost/learn-specs --skill plan-lens -a claude-code --copy -y
```

- `--skill plan-lens` names the pack's only skill.
- `-a claude-code` installs for Claude Code only.
- `--copy` writes real files instead of symlinks.

The installed copy (`.claude/skills/plan-lens/`, `.agents/`) is git-ignored. `skills-lock.json` is committed. It records the upstream commit and a hash of the files, like a package lockfile.

## Consequences

- The repository holds no copy of third-party skill text, and does not fill with folders for agents nobody uses.
- Anyone can restore the exact version from the lockfile (`npx skills experimental_install -a claude-code`; the installer marks that command experimental, so it may change).
- The skill's text was read in full before installing, and the installed files matched the reviewed sizes.
- The hackathon requires the planning documents the skill writes (`devpost/design-brief.md`), which are committed. The skill itself is not required to be in the repo.
