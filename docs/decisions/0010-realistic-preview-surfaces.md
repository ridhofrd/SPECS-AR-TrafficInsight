# 0010. Give the Preview surroundings more realistic surfaces and scale

Date: 2026-11-22. Status: implemented and verified in Preview.

## Context

The author found the home/street/office backgrounds cartoon-like and approved
a more realistic treatment. First inspect the street and UI readability, then
apply the successful approach to home and office. Keep the same trip-stage
meaning and make focused commits. This refines criterion C10.

## Decision

- Use native Lens Studio Uber PBR materials for scenery, with CC0 photographic
  asphalt, concrete and wood diffuse/normal maps from Poly Haven. Use scalar
  roughness and restrained colours; retain unlit materials for route accents.
- Use a tonemapped panoramic sky for the street and low-intensity environment
  lighting. Day/evening still comes from the existing journey snapshot.
- Generate physical-scale UVs and tangents in a separate Preview geometry
  helper. Add rounded edges, cylindrical poles, pots and handles, shaped
  foliage, facade frames, curbs, paving joints and car details. Batch by place,
  colour and surface, and build once.
- Make the home a furnished room with a wood floor, a 2.1 m door, a 46 cm-high
  sofa seat, cushions, pleated curtains and a side table. Give the office a
  tiled forecourt, framed glazing, metal handles, slim canopy and planters.
  Reduce room labels to the existing Headline2 role.
- Match the stopped-road overlay to the surrounding asphalt in Preview. Keep
  route stripe geometry, colours, interactions and hardware material behavior.
- Generate texture mipmaps **and enable them on the material samplers**, with
  trilinear filtering. Generation alone left the distant road visibly noisy.
- Preserve the editor guard, camera/UI positions, seated room offset, all
  journey/weather rules and the absence of scenery colliders or Interactables.

## Sources and reproducibility

[Texture credits](../../Assets/Textures/PreviewSurfaces/README.md) link the four
Poly Haven assets and CC0 license. The source manifest records exact URLs and
checksums. The download/verification script restores originals; no texture
downloads happen inside the Lens. Lens Studio downsizes the sky on import.
Native material presets supply the shader and their default texture assets.

## Validation

TypeScript compilation and runtime startup succeeded. All seven original
downloads passed SHA-256 verification. C10 passed both journeys, place
visibility, no scenery interaction targets, preserved progress and the
rain-ahead/rain-here/dry-route boundaries. All C1-C14 returned `succeeded` on
this revision. Early bridge timeouts happened before scenarios began; those
attempts are not counted as passes. Existing SDK deprecation, renderer batching
and editor authentication/network warnings remain; no script exceptions were
observed in the final startup check.

Fresh planning, stopped-street, arrival, evening and raincoat screenshots are
linked from the README. Actual-camera route-peek checks confirmed look-away,
return-to-view and explicit dismissal. Both bent route shapes, rider markers
and the current simulator control row were captured and inspected. The fixed
camera/UI positions and readable route colours were preserved.

## Limits

This is a more detailed, textured 3D demonstration, not a photographic
reconstruction of a real location. The additive SPECS27 display still shows
the neutral Plane/grid through and outside its display area. No optics were
disabled. No real GPS, live weather, road registration or continuous travel
animation was added. Real Spectacles appearance and performance are untested.
