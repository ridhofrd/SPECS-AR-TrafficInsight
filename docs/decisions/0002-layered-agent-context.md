# 0002. Agent context is split into six layers

Date: 2026-11-18 · Status: accepted

## Context

Three agents share this folder: Claude Code, the `plan-lens` interviewer and the CLAD builder. A model starts every session blank, and more context is not better: Snap's guidance is "the smallest set of high-value information that gets the result you want". Lens Studio also rewrites part of `AGENTS.md` itself, so where our rules live matters.

## Options considered

| Option | Problem |
|---|---|
| One big `CLAUDE.md` with everything | Loaded in every session, grows without limit, and Lens Studio already owns `CLAUDE.md` |
| Rules inside Lens Studio's managed block | Overwritten the next time the project opens |
| Only ask the agent to behave (no settings) | A request can be ignored. A setting cannot |

## Decision

Six layers, each with one owner and one loading rule (details in `docs/context-engineering.md`): Lens Studio's block (L1), project rules in `AGENTS.md` below the END marker (L2), path-scoped rules in `.claude/rules/` (L3), skills (L4), a git-ignored personal layer (L5) and enforced settings (L6).

## Consequences

- The always-loaded project rules stay short (about 30 lines) because that space is paid for in every session.
- Rules for one workflow must not break another. The personal layer names the workflows (`plan-lens`, CLAD builds) that override its preferences.
- A rule that must hold regardless of the agent goes in `.claude/settings.json`, not in prose.
- Path-scoped rules only help Claude Code. Rules every agent needs stay in `AGENTS.md`.
