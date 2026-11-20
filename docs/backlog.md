# Backlog: ideas parked for later

Ideas that were considered and deliberately not built yet, with the reasoning, so they can be picked up later without starting from scratch.

## A glance at the route while riding (parked 2026-11-20)

### The idea

By default the Lens shows **nothing** while the rider is moving, because anything in view is a distraction. But a rider who forgets the route, or wants to check how far along they are, should be able to trigger a **brief look at the route** and have it go away again by itself. The original wording asked for two views: the route **on the road**, and a **broad overview**, shown for a short time, triggered by a **gesture**.

### Why it was parked

It was deferred in favour of three simpler revisions (table gone while riding, floating map when stopped, progress along the path), and because the gesture trigger conflicts with decisions already made:

| Concern | Detail |
|---|---|
| **Hands** | A rider's hands are on the handlebars, and the design already says riding has no hand input. A pinch or other gesture needs a free hand |
| **Glance time** | The research note ([ar-ui-while-moving.md](research/ar-ui-while-moving.md)) cites car guidance of at most 2 seconds per glance away from the road, and design guidance that content while moving should be small and glanceable. A broad overview is not a 2-second glance |
| **Placement** | The same research found centre placement more distracting than the lower part of the view |
| **Preview** | Only standard Interaction Kit gestures can be shown with a mouse. Custom gestures cannot. And the Preview has no road, so a route drawn "on the road" can only be shown as a line in the room |

None of the studies found tested AR glasses on a motorcycle or bicycle, so the glance timing is a direction, not a proven number.

### A safer version to try first

- **Trigger:** a voice command such as "where am I?", with a button on the Ride simulator panel as the preview stand-in (the same pattern as every other voice command in the design).
- **What it shows:** a small strip, low in the view and never in the centre, with progress along the route, minutes left, and the distance to the next problem. It disappears by itself after about 2 seconds, like the alert icon.
- **Broad overview:** stays available only when the rider has stopped, which is what the floating map already provides.

### What it would take

1. Update the design brief: the rule "nothing on screen while riding" gets one named exception, and new done criteria are added.
2. A new short-lived state or sub-state, reusing the 2-second timer that the alert icon already uses.
3. A new small panel in the Lens layer, reusing the card styles and the follow behaviour.
4. A button and voice-command stand-in on the Ride simulator panel.
5. One new LEAF scenario per new done criterion, and a re-run of the existing ones.
6. README and screenshot updates.

### Decisions still open

- Which trigger: voice with a button stand-in (recommended), a pinch, or something else.
- What the glance shows: the progress strip (recommended), a route line, or the overview.
- Whether the glance should be blocked while an alert is showing (probably yes).

### Depends on

The "progress along the path" revision. The glance reuses the same progress information, so it makes sense to build that first.
