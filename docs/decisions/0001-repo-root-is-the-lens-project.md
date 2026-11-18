# 0001. The repository root is the Lens Studio project folder

Date: 2026-11-18 · Status: accepted

## Context

- The `plan-lens` skill stops unless a `.esproj` file is in the folder the agent started in.
- Lens Studio writes `.mcp.json` into the project folder, and Claude Code only reads it from where it starts. Started anywhere else, Claude has no Lens Studio tools.
- The hackathon asks for the Lens Studio project files and a `devpost/` folder at the repository root.

## Decision

The git repository is the Lens Studio project folder itself (`TrafficInsight/`, the folder that holds `TrafficInsight.esproj`). Every agent session starts there.

## Consequences

- Lens Studio's generated files sit next to ours. Its managed blocks (in `AGENTS.md`, `.gitignore` and `.gitattributes`) must be left alone, and our additions go below them.
- Local state (`Cache/`, `Support/`, `Workspaces/`, `PluginsUserPreferences/`), the token-bearing connection files and the `spk_debug_key.pem` key are ignored by the patterns in Lens Studio's managed `.gitignore` block.
- The README and `docs/` live inside the Lens project.
- A parent folder outside the repo can hold personal notes, but must not contain a `CLAUDE.md`, because Claude Code loads that file from every folder above the one it starts in.
- A terminal opened with *File > Show Project in Terminal* keeps its folder locked while it is open. Close it before renaming or moving the project.
