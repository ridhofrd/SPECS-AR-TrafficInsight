# 0009. Show the route while its viewing angle is held

Date: 2026-11-21; author requested the revision on 2026-11-20.
Status: implemented; full Preview regression and visual review completed 2026-11-22.

## Context

The author found that the straight strip looked like a progress bar and
wanted the route's actual shape and their position. They also requested
removing its duration limit: hold the viewing angle to keep it open; look
straight/away or dismiss explicitly to close it. They declined a simulated
route projection on the road. These requests supersede the strip and
maximum-two-second rules in decision 0008.

## Decision

- Draw the selected trip's existing bent polyline in a 24 by 18 cm map.
  Keep the endpoint names, route colour, dim ridden path, yellow rider,
  known hazard section and shared remaining-cost information consistent
  with the planning/stopped views. Label the map schematic.
- Place the rider with `pointAt` on the original route. Slice the ridden
  and hazard sections by original length fractions before scaling them to
  the card. A straight progress fraction is not a map position.
- Use head/camera direction, not eye tracking. The map appears after a
  0.3 s dwell at 20-40 degrees down and within 15 degrees horizontally.
  Once open, 12-45 degrees down and 22 degrees sideways define the hold
  zone. Keep it visible indefinitely while that angle is held.
- Keep heading fixed during viewing/re-entry so a sideways look leaves
  the map. Natural look-away fades out over 0.3 s and permits looking back.
- Add Hide route beside Where am I? on the simulator. An explicit dismissal
  is immediate and stays latched until a level look within 8 degrees for
  0.5 s. The caption request also dismisses the map. Neither changes progress.
- Alerts, stops and arrival continue to dismiss immediately. Returning to
  Riding while still tilted cannot reopen it without the level look.
- Keep the map non-interactive; no route selection or new road overlay is
  added while riding. Keep state ownership and actual visibility readback.

## Validation and persistence

The source implementation and updated C11-C14 are in `45dd3e0`. TypeScript
compilation and runtime startup checks succeeded before the test runs.
C11-C14 completed successfully in Interactive Preview on 2026-11-20; C14's
result was recovered from Lens Studio's editor log after interruption.

Thirty subsequent local assertions passed, including a 24-hour synthetic
hold without timeout, look-away/re-entry, explicit dismissal, both branches
and trips, remaining crash delay and rain boundaries. Syntax checks on
seven scripts passed. Local checks do not establish visual quality.

The saved scene diff replaces the obsolete cap input with pitch/yaw bounds.
It also contains Lens Studio's regenerated LEAF bridge identifiers. No
connection files or unrelated package assets are part of these changes.

After MCP reconnection, C1-C14 all returned `succeeded` on 2026-11-22 with
the refined Preview surroundings installed. Fresh route-map and simulator
screenshots are linked in the README. Actual-camera checks confirmed a
sideways look hides the map, returning reveals it, and Hide route dismisses
it while still looking down. Both bent routes and rider positions were
visually inspected. The historical straight-strip capture remains labelled
as revision history. See [decision 0010](0010-realistic-preview-surfaces.md)
for the surrounding scene refinement and remaining display limitations.

## Consequences

The compact map conveys the route's shape and position using the current
sample data; it does not supply real geographic navigation or GPS alignment.
The unrestricted hold duration is an author-requested interaction choice,
not evidence of safe vehicle use. Snap's [Spectacles best practices](https://support.spectacles.com/hc/en-us/articles/30214013362452-Best-Practices)
explicitly advise against using Spectacles while driving any vehicle. This
corrects the earlier documentation's claim that Snap had no vehicle guidance.
The feature remains a Preview design concept.
