# 0006. Route choices tell one consistent journey

Date: 2026-11-20 · Status: accepted

## Context

The author requested a consistency pass over the built experience, keeping
the planned glance feature for a later revision. The audit found that the
rain warning, weather symbols, recommendation, map position and route costs
could tell different stories. A final screenshot review also found partially
clipped raincoat controls that the existing interaction tests did not catch.

## Decision

- Show the origin near the rider and destination ahead on a heading-up
  schematic. Label both endpoints and the A/B dots. These sample corridors
  do not represent a geographic return journey or real GPS alignment.
- Use the same blue A and green B throughout. Draw common roads once in a
  neutral colour. Yellow identifies the rider; the junction ring is white.
- Warn on A at 10% and hold unresolved demo progress at 14%, before the
  shared approach ends. Both choices must be reachable without teleporting
  the rider. Do not send A's warning when the active route is B.
- Assign each common end road four sample minutes and 0.05 L, with the
  remaining cost on the branch. This makes elapsed approach costs equal
  across alternatives. Planning shows totals; stopped cards show what is
  left. Keep the full unpassed crash delay in the remaining estimate.
- Derive hazard fractions from the kilometre interval and map scale. Reuse
  route timing for the warning and problem-card countdown. The rain warning
  initially reports eight minutes; it decreases if the rider advances.
- Explain the recommendation as Fastest, independently of Current or
  Alternative. The evening dry route explicitly costs 12 extra minutes.
- Use rain-cloud imagery for the hazard, including the weather row and
  preparation reminder. Use text for Raincoat on, not an umbrella symbol.
- Keep the rider stopped while the reminder is open. Skip reminder resumes
  without confirming preparation; Raincoat on confirms it and resumes.
- Make the reminder compact and place it below the map at 135 cm forward.
  Hide the start label beneath it while retaining destination and rider
  information. Both buttons must project fully inside the camera view.
- Say You've arrived, without claiming an unmodelled arrival deadline.

## Validation

TypeScript compilation and runtime Logger checks were run in Lens Studio.
LEAF C1–C9 passed after the consistency changes. C5 and C9 passed again after
the final reminder layout adjustment; C5 now checks every projected button
corner for a margin inside the view. Checks also cover unaffected B in both
trips, common route origins, equal elapsed approach time, preserved reroute
progress, remaining estimates, ranking wording and heading-up endpoints.

Fresh planning, crash, rain and raincoat screenshots were captured from
Interactive Preview and inspected. They are linked from the README.
Renderer batching and SDK deprecation warnings remain. Real glasses,
real-world alignment and riding comfort have not been verified.

## Consequences

The approved design brief and README describe this behaviour. Revision two
must build on the shared timing helpers rather than restore the previous
fixed rain sentence or whole-trip fraction formula. No glance UI, speech
recognition, live data integration or real-road overlay was added.
