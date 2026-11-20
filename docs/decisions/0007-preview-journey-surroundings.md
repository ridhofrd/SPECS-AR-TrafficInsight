# 0007. Preview surroundings follow the journey

Date: 2026-11-20 · Status: accepted

## Context

The author requested a background that gives the demo a meaningful location.
They chose trip-stage context: home for planning, a street while riding or
stopped, and the office on arrival. The return trip must tell the reverse
story. The author approved implementation; the glance feature stays planned.

## Decision

Use one Preview with lightweight procedural scenery. Derive the place,
day/evening palette and known weather from `TrafficInsightState` through the
pure `previewContextFor` helper. `TrafficInsightMain` applies that result to
`TrafficInsightPreviewContext`; scenery never advances or resets the journey.

| State | Morning | Evening |
|---|---|---|
| Planning, including clarification | Home, day | Office, evening |
| Riding, Alerted, Stopped | Street, day | Street, evening |
| Arrived | Office, day | Home, evening |

- Check `global.deviceInfoSystem.isEditor()` before creating any scenery.
  Real glasses retain the rider's real surroundings.
- Keep exactly one place visible. Build boxes into meshes batched by parent,
  material colour and purpose; reuse those meshes across transitions.
- Give scenery no colliders or Interactables. Signs use the existing UI Kit
  text helpers. The rider's existing controls keep their positions.
- Keep the camera and UI fixed. Offset the home/office floor upward 62 cm
  during planning to match the existing seated table composition; use the
  standing floor height on arrival. Put the street just below the stopped
  road overlay to avoid overlapping surfaces.
- Reveal hazard context only after the active route's warning. Use the
  confirmed route during reroute feedback so choosing B clears A's hazard.
- Show known rain in a distant, narrow route-A corridor before the sample
  interval, with fixed clouds and animated drops. Show surrounding drops
  only inside the interval. Clear weather after it, on B, and at arrival.
  Use the same problem fractions as the route map rather than another timer.
- Keep `previewContext` separate from `LensVisibility`. Riding clears the
  interface while the simulated world remains. Snapshot actual hierarchy
  visibility so tests can detect a wrongly enabled place or weather group.

## Preview setup and limits

The visible Preview was set to **Interactive > Plane** with **SPECS27**.
This neutral input avoids a second outdoor scene behind the home/office.
Input selection is local workspace state and must be selected again in a
fresh workspace.

These are stylised surroundings rendered by the Lens inside the simulated
display, rather than a replacement camera background. The neutral Plane grid
can remain visible through additive rendering and outside the display area.
No device optics were disabled to hide that limitation. The street does not
model continuous vehicle motion or geographically registered route branches.
No GPS, live weather, speech recognition or real-road alignment was added.

## Validation

TypeScript compilation and runtime Logger checks succeeded. Existing renderer
batching and SDK deprecation warnings remain; no runtime exceptions were
observed.

LEAF C1-C9 passed with the scenery installed. New C10 passed after the final
distant-rain refinement. It checks both journeys, actual place visibility,
day/evening, rain ahead versus rain here, dry rerouting, preserved progress,
no scenery colliders or Interactables, and an empty riding interface. C2
also passed again for the home-arrival capture.

Fresh home-planning, day-street, evening-street, rainy-stop, raincoat,
office-arrival and home-arrival screenshots were inspected and linked in
the README. No Spectacles device is available; the editor guard's hardware
behaviour and device performance remain unverified on hardware.

## Consequences

The approved brief adds criterion C10. The future glance plan now reserves
C11-C14 so scenario IDs remain unique. Its implementation has not started.
The README records the scenery setup and the distinction between simulated
context and real surroundings.
