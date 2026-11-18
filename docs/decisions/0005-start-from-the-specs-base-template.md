# 0005. The project starts from the SPECS Base Template

Date: 2026-11-18 · Status: accepted

## Context

Devpost's skill pack and `plan-lens` both say to create the project with *SPECS > Base Template*. The first attempt used Lens Studio's plain "new project" instead. The two differ in ways that matter for this hackathon:

| | SPECS Base Template (Lens Studio 5.25.0) | Plain new project (what was created first) |
|---|---|---|
| `fromTemplateName` in the `.esproj` | `Spectacles` | `Default` |
| Scene | About 76 KB: camera with device tracking, lighting, and the Interaction Kit rig (hand visuals, hand, mouse and mobile interactors, cursors) | About 6 KB: a camera, a light and an environment map |
| `Packages/` | Interaction Kit (SIK), UI Kit, Motion, Icons | Empty |

The project rules require interactions to use SIK and UI Kit so they work with the mouse in Interactive Preview and with LEAF tests. The Base Template is the documented way to get them, and its scene is already wired for Spectacles.

## Decision

Start from the SPECS Base Template. The first project was set aside and the repository was rebuilt from the template.

The template was copied from Lens Studio's own cache (`%LOCALAPPDATA%\Snap\Lens Studio\Bundle\ProjectTemplates\`). Every file was compared by SHA-256 against the cached copy, and the project file was renamed to `TrafficInsight.esproj`. After Lens Studio opened it, the only change to the template files was the build number in the project file (26111006 to 26111423). The first commit holds the template plus the files Lens Studio generated.

## Consequences

- The first commit is Snap's template, so every later diff shows only this project's own work.
- Snap's `Docs/README.md` and `TAGS.md` describe the template as an entry in Snap's samples catalog, and `Docs/` would clash with `docs/` on case-insensitive file systems. They were removed in the second commit.
- The project date is 2026-11-18, inside the hackathon's submission period. The template and its packages are Snap's work and are credited in the README.
