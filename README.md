# TrafficInsight

**A commute co-pilot for motorcycle riders on Snap Spectacles.** Plan a trip in your space, receive a brief warning when your route is affected, and pull over to compare the options before continuing.

Built for **Learn AR with SPECS, Round 2**, using Lens Studio, CLAD, the Lens Studio MCP, Spectacles Interaction Kit and UI Kit.

## Demo video

[![TrafficInsight demo showing the departure card and both routes in Lens Studio Preview.](docs/media/traffic-insight-demo-cover.jpg)](https://github.com/ridhofrd/SPECS-AR-TrafficInsight/raw/refs/heads/main/docs/media/traffic-insight-demo.mp4)

[Watch or download the 50-second MP4](https://github.com/ridhofrd/SPECS-AR-TrafficInsight/raw/refs/heads/main/docs/media/traffic-insight-demo.mp4)

Follow a sample return commute from departure planning and the weekday graph through the riding glance, a rain alert, rerouting, and arrival.

> **Preview realism revision, 2026-11-22.** Home, street and office now have photographic surfaces, PBR shading and more detailed geometry. TypeScript compilation, runtime startup and all 14 LEAF scenarios passed, including the route-shaped peek and viewing-angle behavior.
> [Traffic Insight departure planning](#traffic-insight-departure-planning) adds a leave-now versus wait comparison for the Barcelona commute. The default Preview uses labeled sample times. Movement, map geometry, hazards, weather and fuel are simulated. No Spectacles hardware has been tested.

## Contents

- [Demo video](#demo-video)
- [What it does](#what-it-does)
- [Traffic Insight departure planning](#traffic-insight-departure-planning)
- [Walkthrough](#walkthrough)
- [Preview surroundings](#preview-surroundings)
- [Tests](#tests)
- [Why it belongs on glasses](#why-it-belongs-on-glasses)
- [How this project is built](#how-this-project-is-built)
- [Design decisions made during the build](#design-decisions-made-during-the-build)
- [Known limitations](#known-limitations)
- [Repository layout](#repository-layout)
- [Run it yourself](#run-it-yourself)
- [How the agents are configured](#how-the-agents-are-configured)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [The hackathon](#the-hackathon)
- [What I learned](#what-i-learned)
- [Credits and license](#credits-and-license)

## What it does

The demo follows one day in two trips:

1. **Home to office:** compare two routes, choose one, then respond to a crash on route A by pulling over and choosing again.
2. **Office to home:** respond to rain on route A by comparing the fastest rainy route with the longer dry alternative, or prepare a raincoat before continuing.

The Lens shows the full interface only while Planning or Stopped. Riding clears the table, map, labels and road marks. A deliberate look into the dashboard direction reveals a compact route map while that angle is held; an eyes-free request reports the same facts through the simulator caption fallback. An affected-route alert briefly shows a small icon, with a chime and a caption on the separate simulator panel.

```mermaid
stateDiagram-v2
    [*] --> Planning
    Planning --> Riding: choose a route
    Riding --> Alerted: problem on the active route
    Alerted --> Riding: icon expires after about 2 s
    Riding --> Stopped: pull over to compare
    Stopped --> Riding: confirm a route or finish the raincoat reminder
    Riding --> Arrived: destination reached
    Arrived --> Planning: start another trip
```

## Traffic Insight departure planning

![The Now card in Interactive Preview shows a busy 17:45 return trip and the Show traffic graph button.](docs/media/traffic-insight-now.png)

**Now** uses the latest paired traffic estimates for both routes and compares them with a typical lighter departure within the next hour. Fresh estimates count for up to 20 minutes. When they expire, the card labels its estimates as typical traffic. Each available option shows ride duration and estimated arrival time, so a shorter ride can still get you there later. Pinch either route to leave immediately. The estimate for the route you picked carries into the riding peek, **Where am I?**, and the stopped route comparison.

The modeled commute connects Via Júlia metro station in Nou Barris with DFactory in the Zona Franca industrial estate. Route A passes through Passeig de Colom. Route B passes through Plaça d'Espanya. **Main office** uses this outbound commute, and **Go home** from the main office uses its return direction. The branch office shows a sample estimate and indicates that it has no traffic history.

### Try the four departure scenarios

In Interactive Preview, pick **Go to office > Main office**. While the planning map is open, use **Change sample time** to cycle through the labeled Tuesday examples.

| Barcelona time | Traffic Insight | Leave now | Wait |
| --- | --- | --- | --- |
| 07:30 | Good time to go | A takes 34 min. Arrive 08:04. | No departure in the next hour saves five minutes of riding. |
| 08:00 | Busy. B saves 13 min over A. | B takes 43 min. Arrive 08:43. | Leave at 08:30 on A. Ride 34 min and arrive 09:04. |
| 08:15 | Busy. A is still quickest. | A takes 53 min. Arrive 09:08. | Leave at 08:30 on A. Ride 34 min and arrive 09:04. |
| 09:30 | Still learning this departure time | Both routes remain selectable using sample estimates. | No departure recommendation. |

### Plan for another weekday

![The Sunday graph in Interactive Preview shows typical travel minutes for routes A and B, day buttons, and the Hide graph control.](docs/media/traffic-insight-weekday.png)

Select **Show traffic graph**, then choose **Mon** through **Sun** to see that day's graph. The horizontal axis shows Barcelona departure time. The vertical axis shows typical ride minutes for route A in blue and route B in green. Lower points mean shorter rides. Both axes stay fixed as you switch days for the same commute direction. Missing intervals appear as gaps. Each plotted slot requires observations from at least three matching dates. Select **Hide graph** to return to current departure advice. Reopening the graph restores the weekday you last viewed for this plan. The route cards below the graph always show the estimates for leaving now.

### Use collected traffic history

The independent collector can run while Lens Studio is closed. It records traffic-aware motorcycle trip estimates every 15 minutes and groups them by direction, Barcelona weekday and local time. A slot needs at least three matching dates before it can inform a recommendation. Live collection requires a TomTom API key and an HTTPS URL for the exported profile. During planning the Lens refreshes that profile at most once per minute. [Collector setup and route sources](tools/traffic-history/README.md)

**Preview verification.** LEAF C15 passed in Interactive Preview on 2026-11-24. The Now screenshot shows a busy return trip, and the graph screenshot shows a sample Sunday. [See the 17:00 good-time sample](docs/media/traffic-insight-departure.png).

## Walkthrough

### Planning: where am I going, and which option is fastest?

![Planning map from the previous Preview revision showing Home as Start, Office as Destination, and the route cards.](docs/media/realistic-home-planning.png)

**Go to office** asks which office, then displays the map. **Go home** opens the return trip.

The map is a **heading-up schematic**: the start is near the rider and the destination is ahead in either trip. Labels change from Home to Office to Office to Home. This is an illustrative layout, not a north-up geographic map.

A is blue and B is green on the map, cards and mock road. The dots carry their letters. Shared approach and destination roads are neutral, so neither route appears to own the rider's position before the fork.

Cards say **min total** and **L total** during planning. The recommended option has a star and **Fastest**; travel time takes priority and fuel breaks ties. In the morning the sample totals are 34 minutes / 0.50 L for A and 40 minutes / 0.60 L for B.

### Riding: keep the view clear

![Riding with the table, map and other Lens content hidden.](docs/media/realistic-street-riding.png)

Choosing a route hides the full Lens interface. Look forward normally for a clear road view; the glance below is the one requested exception. **Ride** advances the simulator by 5% per press. Both sample hazards belong to A: choosing B allows either trip to finish without a false warning or forced stop.

On A, a warning fires at 10%, before the fork. The icon is low and off-centre and disappears after about two seconds. The rain warning is computed from the same route timing as the rain card: initially about eight minutes ahead. If the rider advances before stopping, the card's countdown decreases.

Until the simulated problem is resolved, progress is held at 14%, still before the fork. This is demo scaffolding that keeps both choices reachable, not a model of real vehicle behaviour.

### Route peek while riding: the route and your position

![The route-shaped peek on B, with the yellow rider position and ridden path on the same bent route.](docs/media/realistic-route-peek-b.png)

After choosing a route, look level for half a second, then **look down 20-40 degrees for 0.3 seconds** toward the dashboard spot. The compact map sits about 1 m away and 25 degrees below the horizon. This uses head/camera direction, not eye tracking. In Interactive Preview, right-drag to tilt and turn the camera.

The map shows the **same bent route as the planning view**, with Home/Office endpoints, a yellow **you** marker, the ridden path dimmed, and any known problem interval. The marker follows both coordinates of the route as progress advances. A stays blue and B stays green. Remaining minutes and the next problem stay below the map. This is the existing sample route geometry, not a real GPS map.

**There is no duration limit while you hold the viewing angle.** The heading stays fixed during the peek so looking sideways actually leaves the map. Looking straight, too far down or more than 22 degrees sideways hides it with a short fade. Looking back into its direction reveals it again after the dwell. Slight pitch/yaw changes use hysteresis to avoid flicker.

**Hide route** on the simulator dismisses it immediately. After an explicit dismissal, a Where am I? request, or a state interruption, look level within 8 degrees for half a second before reopening. Alerts, stops and arrival always dismiss the map immediately. The compact map itself has no hand targets; route selection remains in Planning or Stopped.

The [evening route A capture](docs/media/realistic-route-peek-a.png) shows the reverse trip and the known rain interval. The previous straight-strip capture is retained as [revision history](docs/media/glance-riding.png). It does not depict the current map.

### Where am I: the same facts by caption

![The simulator with Where am I?, Hide route and the caption answer.](docs/media/realistic-simulator-caption.png)

The simulator's **Where am I?** button stands in for a voice request. **Hide route** sits beside it. While Riding it reports the remaining minutes and next problem using the same `glanceFacts` helper as the route map. It clears any active route peek and leaves the Lens view empty. Outside Riding it says **Ask while riding.**; during an alert it is disabled so the warning stays in charge. Speech recognition is not implemented, and this SDK uses the existing caption fallback for spoken sentences.

Unknown hazards are not disclosed: before a warning the answer says **No reported problems**. A known hazard has a countdown before its interval and a time to leave while inside it. After passing it, or after rerouting to dry B, the answer says **Route clear**. Remaining minutes reuse the stopped cards' cost calculation, including an unpassed crash delay.

### Stopped after the crash: what changed, and why reroute?

![Crash stop: current A, fastest alternative B, an affected-route delay card, yellow rider marker, neutral approach and white road junction ring.](docs/media/realistic-street-stopped.png)

**I've stopped** opens the floating map without the table. The yellow marker and **You are here · A** card identify the rider and current route. The dim stretch records travel already completed; the card reports elapsed minutes.

Route cards now say **min left** and **L left**, measured from that same position. At the 10% stop, the sample is approximately 50 minutes remaining on A including the crash delay, versus 38 on B. A remains labelled **Current**; B is **Alternative** and **Fastest**. The coral card explains the cause: **+18 min delay** on A.

Both choices begin at the rider's shared approach. Selecting B preserves the position and time already ridden. Aim at a dot, a route button or a road stripe to brighten the corresponding stripe. Pinch a dot or stripe to select; the chosen stripe glows and the other fades for 1.2 seconds before the Lens clears again. The white ring marks the junction; yellow is reserved for the rider.

Arrival says **You've arrived.** No deadline is modelled, so the Lens does not claim the rider is on time.

### Evening: fastest through rain, or a longer dry route?

![Evening stop: A is Current and Fastest with a rain icon; the dry alternative B explicitly costs 12 more minutes. Office is Start and Home is Destination.](docs/media/realistic-rain-stopped.png)

The amber card identifies rain on A, its distance interval, temperature, intensity and type. A's weather row uses the same rain-cloud symbol as the alert and problem card. Dry rows keep the dry-weather symbol.

The choice is explicit: **A is fastest, with heavy rain; B is dry and takes 12 minutes longer.** Weather does not silently override the agreed time-first ranking. The totals are 36 minutes / 0.50 L for A and 48 minutes / 0.60 L for B; the stopped cards subtract the travel already completed.

### Keeping A: prepare before riding

![The compact raincoat reminder sits below the map, with Skip reminder and Raincoat on fully visible. The destination and yellow rider marker remain visible.](docs/media/realistic-raincoat.png)

Selecting rainy A asks the rider to put on a raincoat **before riding**. **Skip reminder** resumes without a raincoat confirmation; **Raincoat on** confirms preparation and resumes. The same rain symbol describes the hazard throughout; an umbrella is not used as a raincoat action.

The selected road stripe remains highlighted while this question is open. The start label beneath the map hides to make room; the destination and rider card remain. Both controls fit inside the view and are checked by C5.

### Ride simulator: preview only

![Earlier capture of the separate simulator; the current row pairs Where am I? with Hide route.](docs/media/glance-caption.png)

The panel to the rider's right is labelled **Ride simulator (preview only)**. Its buttons substitute for destination/route voice commands, GPS movement and stopping detection. Spoken sentences currently appear as captions; the chime and confirmation tones have audio tracks. It is scaffolding, not a rider-facing control panel while moving.

Sample data and the shared timing/fuel calculations live in [`TrafficInsightTripData.ts`](Assets/Scripts/TrafficInsightTripData.ts). Each shared end road is assigned four sample minutes and 0.05 L; the branch contains the remaining cost. This keeps the already-ridden cost equal when switching routes before the fork. Hazard fractions are derived from the displayed kilometre interval and map scale.

## Preview surroundings

The scenery makes the journey stage visible: plan at home, compare routes on the street, and arrive at the office. The return trip starts at the office and ends back home, with evening colours.

| Stage | Morning: home to office | Evening: office to home |
|---|---|---|
| Planning, including clarification | Home, day | Office, evening |
| Riding, Alerted or Stopped | Street, day | Street, evening |
| Arrived | Office, day | Home, evening |

| Office arrival | Home arrival |
|---|---|
| ![Office doors and sign on morning arrival.](docs/media/realistic-office-arrival.png) | ![Home room on evening arrival, with the Lens interface cleared.](docs/media/realistic-home-arrival.png) |

The [office planning view](docs/media/realistic-office-planning.png) shows the return trip's origin. The [evening riding view](docs/media/realistic-evening-riding.png) retains distant known rain while the route interface is hidden.

The surroundings now use photographic asphalt, masonry and wood textures, PBR shading, rounded furniture, framed doors/windows and a panoramic sky. Texture mipmaps and trilinear sampling keep distant surfaces calmer behind the route cards. The home has curtains, cushions and a wood floor; the office has a tiled entrance, metal door handles and a canopy. [Sources and licenses](Assets/Textures/PreviewSurfaces/README.md) include checksums and a restoration script.

They follow the same state as the UI, without refreshing the Preview or resetting progress. Scenery has no colliders or hand interactions. A known crash appears ahead on A; known evening rain stays in the distant A corridor before the rain interval, surrounds the rider inside it, and clears after it or when choosing dry B. The street remains visible during the warning and raincoat reminder.

**Editor only:** the component checks `isEditor()` before building scenery. On real glasses, the rider's actual surroundings would provide this context. This does not add GPS, live weather, geographic road alignment or a riding HUD; the route peek is a separate, requested Lens visual.

For the demo, use **Interactive > Plane** with the **SPECS27** device in Preview. The authored scenery appears inside the simulated display; the neutral Plane and its grid can remain visible through the additive display and around its edges. This is a staged Preview environment rather than a full replacement of Lens Studio's camera background. Preview input selection is local workspace state; choose Plane again in a fresh workspace.

## Tests

**C1-C14 passed in Interactive Preview on 2026-11-22**, after TypeScript compilation and runtime Logger checks. C10 verifies the refined scenery across both trips and weather boundaries; C11-C14 cover the route-shaped map and viewing-angle behavior. The LEAF bridge initially timed out before starting scenarios; the completed runs below all returned `succeeded`.

All seven photographic source files passed SHA-256 verification. Earlier local route-peek checks included a 24-hour synthetic hold without a timeout; that is logic evidence, not a 24-hour device test.

| ID | Verified behaviour | Result |
|---|---|---|
| C1 | Destination clarification, two route dots, explicit total estimates, Fastest reason and destination ahead | Pass |
| C2 | Ride advances progress; both trips on unaffected B reach arrival with no false alerts or Lens visuals | Pass |
| C3 | Crash warning, chime request, caption, low/off-centre icon and approximately two-second expiry | Pass |
| C4 | Reachable alternatives at one position, remaining costs, reroute without a progress jump, persistent recommendation, glow and arrival | Pass |
| C5 | Matching rain countdown, fastest/rain versus dry/+12 trade-off, home ahead, both reminder actions and every button corner inside the view | Pass |
| C6 | Table visible throughout Planning and hidden in every other state | Pass |
| C7 | Floating map about 1.1 m ahead and below eye level | Pass |
| C8 | Dim ridden stretch, larger yellow rider marker, explicit rider/route/elapsed card, hidden when riding | Pass |
| C9 | Road/map separation, usable stripe width, hover, pinch, chosen glow, other-route fade and hidden riding view | Pass |
| C10 | Home/street/office across both trips, day/evening, actual scene visibility, weather boundaries, dry reroute and preserved progress | Pass |
| C11 | Look-down dwell, bent route mesh, two-coordinate rider position, dashboard placement and no hand targets | Pass |
| C12 | No duration cap, pitch/yaw look-away and re-entry, explicit Hide route and re-arming | Pass |
| C13 | Shared remaining estimates and hazard boundaries; actual caption button; no visual or progress change | Pass |
| C14 | Blocked states, immediate alert/stop/arrival dismissal and no automatic reopening | Pass |
| C15 | Recent traffic, historical fallback, weekday graph open, hide, restore and rider override | Pass (2026-11-24) |

Sound audibility, hardware hand tracking, daylight readability and real riding comfort are unverified. Logger checks still report existing SDK deprecation and renderer batching warnings; no runtime exceptions were observed during verification.

## Why it belongs on glasses

- **Requested context in the view.** Full route comparison is reserved for planning or stopping. The prototype clears it during Riding and offers the compact route peek only when requested by viewing direction, plus a caption/optional spoken answer. The intended voice interactions currently use simulator buttons as stand-ins.
- **The routes are laid out in your space.** When stopped, the options float in front of you at a readable size, side by side, instead of on a small flat map.

## How this project is built

```mermaid
flowchart LR
    A["plan-lens skill\nshort interview, you decide"] --> B["devpost/design-brief.md\nthe design, in writing"]
    B --> C["CLAD agents\nbuild the Lens in Lens Studio"]
    C --> D["LEAF tests\none scenario per done criterion"]
    D --> E["Judge in the Preview\nfix with design notes"]
    E -->|"iterate"| C
    E --> F["Demo video + repo\nsubmit to Devpost"]
```

1. **Plan.** The `plan-lens` skill interviewed the author about the idea and checked it against AR design habits and against what the Lens Studio preview can show. The answers became the design brief in `devpost/`.
2. **Build.** CLAD (Snap's "Closed Loop Agentic Development" agents) built the Lens from the brief, talking to Lens Studio through its built-in MCP server. Each build step (planning, assets, UI, scripts, scene set-up, audits) ran as its own agent.
3. **Test.** LEAF (Lens Evaluation and Automation Framework) scenarios press the buttons in the Preview, one per done criterion.
4. **Judge and iterate.** Problems found in the Preview were fixed as design notes, for example "raise the table 15 cm so the map stays in view".

### Inside the Lens

```mermaid
flowchart LR
    SIM["Ride simulator panel\n(buttons, preview only)"] --> MAIN
    DOTS["Route dots\n(pinch, aim)"] --> MAIN
    LINES["Route stripes on the road\n(pinch, aim)"] --> MAIN
    MAIN["TrafficInsightMain\nwires input to state"] --> STATE["TrafficInsightState\nthe rules, no scene code"]
    STATE -->|snapshot| MAIN
    MAIN --> MAP["Route map\nlines, highlight, dots,\nridden stretch, you-are-here"]
    MAIN --> ROAD["Road view\nmock street, stripes, ring"]
    MAIN --> CARDS["Lens cards\nlabels, problem card, progress card,\nreminder, alert icon"]
    MAIN --> CONTEXT["Preview surroundings\neditor only: home, street, office"]
    MAIN --> GLANCE["Route peek map\nrequested, Riding only"]
    MAIN --> AUDIO["Audio + captions"]
    MAIN --> LEAF["getState()\nfor LEAF tests"]
```

Every press goes to one place, `TrafficInsightState`, a plain state machine with no scene code. After each change, `TrafficInsightMain` redraws everything from the state's snapshot. The scene views derive their visibility from that state. Preview surroundings have a separate snapshot from `LensVisibility`, so C2 can check that the riding interface is empty while C10 checks that the street remains visible. Within the scenery component, only the decorative rain animation uses a frame timer.

| Script | Role |
|---|---|
| `TrafficInsightState.ts` | The five states, every transition, and which parts are visible in each (including the table) |
| `TrafficInsightTripData.ts` | Sample routes, shared timing/fuel helpers and the Fastest rule |
| `TrafficInsightMain.ts` | Connects input to the state, redraws the views (and shows or hides the table), runs the 2 s alert timer |
| `TrafficInsightRouteMap.ts` | Builds the route lines, problem highlight, dim ridden stretch, "you are here" marker and pinchable dots at runtime |
| `TrafficInsightRoadView.ts` | Builds the stopped-road overlay, the two route stripes (aimable and pinchable) and the pulsing ring at runtime |
| `TrafficInsightPreviewContext.ts` | Builds editor-only home, street and office scenery; applies the pure `previewContextFor` result and reports actual visibility |
| `PreviewSurfaceGeometry.ts` | Batched scenery meshes with physical-scale UVs, PBR tangents, rounded boxes, cylinders and ellipsoids |
| `TrafficInsightGeometry.ts` | The small mesh helpers the map and the road view share (ribbon, puck, ring, rectangle, box) |
| `TrafficInsightTrafficLensUI.ts` | The Lens layer: label cards, problem card, progress card, raincoat reminder, alert icon (UI Kit) |
| `TrafficInsightRideSimulatorUI.ts` | The demo panel (UI Kit) |
| `TrafficInsightGlanceTrigger.ts` | Pure pitch/yaw/time logic: dwell, viewing-angle hysteresis, fade and re-arm; no duration cap |
| `TrafficInsightHeadingFollow.ts` | Positions the dashboard spot from yaw, holding heading while viewing and during re-entry |
| `TrafficInsightGlanceStripUI.ts` | Non-interactive UI Kit route map using the trip polyline, dim ridden path, position and shared facts |
| `TrafficInsightLazyFollow.ts` | Lets the alert icon follow the head gently |
| `TrafficInsightAudioController.ts` | Plays the four sound effects |

## Design decisions made during the build

- **Reachable choices:** alerts and stops occur on the common approach, before the fork. Both route corridors have the same shared geometry; switching does not teleport the marker.
- **One meaning per visual:** blue A, green B, yellow rider, coral crash, amber rain, white junction ring, neutral shared roads. Route identity stays fixed when the recommendation changes.
- **Explain the recommendation:** Fastest names the ranking reason; Current names the rider's actual route. The dry evening option explicitly says +12 min.
- **One scope per estimate:** totals before departure, remaining time/fuel after stopping, elapsed travel on the rider card. Rain notifications and cards share the same countdown calculation.
- **Heading-up schematic:** both sample journeys show origin near the rider and destination ahead. This does not imply real road registration or geographic accuracy.
- **Readable additive-display panels:** slate Lens cards, warm-grey simulator, light text and saturated route accents. Labels identify endpoints and route dots.
- **Confirmation before moving:** a 1.2-second route glow; hand input is gated during alert/confirmation. Raincoat preparation keeps the rider stopped.
- **Reminder stays in view:** a compact panel below the map, with no redundant start label beneath it; C5 checks projected button corners.

The route reasoning and validation are recorded in [decision 0006](docs/decisions/0006-consistent-route-story.md). The trip-stage scenery and its Preview limitations are recorded in [decision 0007](docs/decisions/0007-preview-journey-surroundings.md); its surface/detail refinement is [decision 0010](docs/decisions/0010-realistic-preview-surfaces.md). The original strip is recorded in [decision 0008](docs/decisions/0008-requested-route-glance.md); the author's route-map and duration changes supersede it in [decision 0009](docs/decisions/0009-route-peek-viewing-angle.md).

## Known limitations

- **Vehicle use is outside this prototype.** Snap's [Spectacles best practices](https://support.spectacles.com/hc/en-us/articles/30214013362452-Best-Practices) explicitly advise against using Spectacles while driving any vehicle. This corrects our earlier claim that Snap had no vehicle guidance. This remains a Preview design concept.
- **No spoken voice.** The Lens plays its chime and tones, but the text-to-speech module is deprecated in this SDK, so the spoken lines appear as captions on the simulator panel instead. The brief planned captions as the fallback for exactly this case.
- **Preview only.** Hand tracking, comfort over time and readability in daylight are untested on real Spectacles. The viewing-angle thresholds and unrestricted hold duration are prototype choices; real riding posture and the comfort of a heading-following anchor remain unverified. Speed-based voice-only restrictions are a future-product idea; this simulator has no speed input.
- **The road view and map are schematic stand-ins.** The route corridors and surrounding street are illustrative models in Preview. How accurately a route line would sit on a real road, and how it would look in daylight, is untested.
- **Tooling left in the scene.** The scene contains an `AiPreviewAgent Handler` object, added by the Lens Studio preview tools the agent used. It renders nothing and may be removed before submission.

## Repository layout

| Path | What it is |
|---|---|
| `TrafficInsight.esproj` | The Lens Studio project file |
| `Assets/Scripts/` | The Lens's TypeScript components (see [Inside the Lens](#inside-the-lens)) |
| `Assets/Tests/` | LEAF scenarios C1 to C15 and their shared driver |
| `Assets/GeneratedMeshes/`, `Assets/GeneratedSFX/` | The table and city map models and the four sound effects, all made in code (no third-party assets) |
| `Assets/Icons/`, `Assets/Materials/` | Material icons, route accents and native Preview PBR materials |
| `Assets/Textures/PreviewSurfaces/` | CC0 photographic surfaces and sky, source manifest and texture credits |
| `Packages/` | Spectacles Interaction Kit (SIK), UI Kit, Motion and Icons from the Base Template; LEAF; and the Lens Studio preview-agent helpers. Stored with Git LFS |
| `tools/asset-generators/` | Model and sound generators, plus the photographic texture restore/verification script |
| `devpost/` | The planning documents written by `plan-lens` (required by the hackathon) |
| `docs/` | Everything beyond this README: [context-engineering.md](docs/context-engineering.md), [submission.md](docs/submission.md), [decision records](docs/decisions/), [plans](docs/plans/) for work agreed but not built yet, and `media/` for screenshots |
| `AGENTS.md`, `CLAUDE.md` | Instructions for coding agents (Lens Studio's block plus this project's rules) |
| `.claude/` | Claude Code settings and path-scoped rules |
| `skills-lock.json` | Pins the exact version of the `plan-lens` skill |
| `.gitignore`, `.gitattributes` | Lens Studio's managed blocks (what to ignore, Git LFS for large assets, LF for text) plus a small block of our own below them |

Lens Studio also creates `Cache/`, `Support/`, `Workspaces/` and `PluginsUserPreferences/` locally, and the build tools create `.clad/`, `.virtual-scene.json` and `Plugins/`. All are regenerated and git-ignored.

## Run it yourself

**Requirements:** Lens Studio **5.25 or later** (Snap's CLAD, MCP and LEAF documentation requires it) and **Git LFS**. A Spectacles device is not needed.

The large files (the environment map, the packages and the generated assets) are stored with Git LFS, so a plain ZIP download from GitHub will not contain them. Snap's notes for the Base Template say the same: "Clone with Git LFS; a ZIP download will not work."

1. Install Git LFS, then run `git lfs install` once. Clone the repository. If the packages show up as tiny text files, run `git lfs pull`.
2. Open `TrafficInsight.esproj` in Lens Studio.
3. In the **Preview** panel choose **Interactive > Plane**, retaining **SPECS27**. This neutral input lets the authored surroundings tell the trip stage. In Interactive Preview:
   - `W` `A` `S` `D` to move, `Q` and `E` to move down and up
   - right-drag (or hold Shift) to look around
   - a mouse click acts as a pinch
4. Turn right to find the Ride simulator. Press **Go to office**, answer the question, look back at the table and click a route dot. Then press **Ride** a few times.
5. While Riding, look level for half a second, then right-drag to look down about 25 degrees. The route map appears after a short dwell and remains while the viewing angle is held. Look straight or aside to hide it; return to its direction to reopen. Hide route dismisses it explicitly and then requires a fresh level look. Turn right to the simulator and use **Where am I?** for the caption-only alternative.
6. To work on it with a coding agent, see [How the agents are configured](#how-the-agents-are-configured).

_Unverified: these clone steps have not been tested from a fresh clone, because the repository has no remote yet._

## How the agents are configured

Three agents share this folder: Claude Code, the `plan-lens` skill and the CLAD builders. They are kept useful by giving each one only the context it needs, and by enforcing the rules that must never be broken with settings instead of requests. The full explanation, with diagrams, is in **[docs/context-engineering.md](docs/context-engineering.md)**. In short:

| Layer | Files | Purpose |
|---|---|---|
| Lens Studio's block | `AGENTS.md` (top), `CLAUDE.md` | Runtime, APIs, spatial rules. Rewritten by Lens Studio, never edited by hand |
| Project rules | `AGENTS.md` (below the END marker) | The brief is the source of truth, Preview-only, SIK and UI Kit, conventions |
| Path-scoped rules | `.claude/rules/` | Loaded only when matching files are touched |
| Skills | `skills-lock.json` | `plan-lens` pinned to an exact upstream commit |
| Guarantees | `.claude/settings.json` | No AI attribution in commits, token files unreadable to agents, confirmation before `git push` |

The reasoning behind the main choices is recorded in [docs/decisions/](docs/decisions/).

To set up your own agent in this project: open the project in Lens Studio first, start the MCP server (*AI Assistant > AI Model Context Protocol (MCP) > Configure Server*), then start your agent from the project folder. For Claude Code, install the CLAD plugin:

```text
/plugin marketplace add https://github.com/lens-studio-devs/ls-extensions.git
/plugin install ls-clad@ls-extensions
```

## Troubleshooting

Problems that came up while setting up and building this project on Windows 11. Most are likely to affect other participants.

**Lens Studio closes immediately after launching.** The crash dumps in `%LOCALAPPDATA%\Snap\sentry\...\reports` all showed a null-pointer crash in `MSVCP140.dll`, Microsoft's Visual C++ runtime. The cause was a stale runtime: the three files `msvcp140.dll`, `vcruntime140.dll` and `vcruntime140_1.dll` in `C:\Windows\System32` were version 14.28 while Windows reported a much newer redistributable as installed. Installing the latest 64-bit [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) replaced them (all three then reported 14.52) and Lens Studio started normally. If the installer says a newer version is already present, choose *Repair* and restart Windows. You can check the versions with `(Get-Item C:\Windows\System32\msvcp140.dll).VersionInfo.FileVersion`.

**The *Core Chat Tools* and *Agents Docs* plugins are missing from *Preferences > Plugins*.** Lens Studio downloads its recommended plugins at startup. If it launches before the network is ready, the log shows `Error when fetching preinstalled content from asset library: Offline mode`, and it does not retry. Close Lens Studio completely and reopen it with a working connection, wait about a minute, then tick both plugins.

**The `Packages/` folder is empty and the scene has no Interaction Kit.** The project was created with Lens Studio's plain "new project" instead of *SPECS > Base Template*. The two look alike (both target Spectacles) but only the Base Template includes the Interaction Kit, UI Kit, Motion and Icons packages. Check `fromTemplateName` in the `.esproj` file: it should say `Spectacles`, not `Default`. See [decision 0005](docs/decisions/0005-start-from-the-specs-base-template.md).

**Claude cannot reach `lens-studio`.** Lens Studio must be running before the agent starts, and its port can change after a restart. In Claude Code, `/mcp` shows the connection and lets you reconnect.

**A pushed repository has tiny text files instead of assets.** Git LFS uploads the large files from a per-repository `pre-push` hook. Without it, only the pointer files are pushed. Run `git lfs install --local` in the repository before the first push, and check that `.git/hooks/pre-push` exists.

**The project folder cannot be renamed or moved ("in use" or "access denied").** A terminal opened with *File > Show Project in Terminal* keeps its folder locked, even after the program running in it has exited. Close the whole terminal window first. If it still fails, restarting Windows releases the lock.

**An agent driving the Preview presses a button it did not aim at.** When the MCP preview tool pinches a button with the simulated right hand, the hand can brush a neighbouring button as it pulls back, which registers as a second press (seen with **Go home** next to **Go to office**, and with **Ride**). Using the left hand with short, isolated pinches reduces it; LEAF provides the reproducible checks. Mouse clicks and LEAF's own input are not affected.

## Roadmap

- [x] Create the Lens Studio project from the SPECS Base Template (Lens Studio 5.25.0)
- [x] Layer the agent context and document it
- [x] Pin the `plan-lens` skill
- [x] Brainstorm the idea
- [x] Run `plan-lens` and approve `devpost/design-brief.md`
- [x] Build with CLAD and test with LEAF (C1 to C5 passed at the first build)
- [x] Screenshots in `docs/media/` and the feature walkthrough
- [x] Revision 1, part 1: the table shows only while planning, and the map floats when stopped (C6)
- [x] Revision 1, part 2: progress along the path (the ridden part dim, a "you are here" marker, a progress card) (C8, with the map placement check C7)
- [x] Revision 1, part 3: the route marked on the road ahead (a mock street with pinchable route lines) (C9; C1 to C9 pass)
- [x] Consistency polish: route reachability, timing, ranking explanation, map labels, unified symbols and reminder layout (C1-C9 pass)
- [x] Preview surroundings: home, street and office follow both trips, with day/evening and route-aware rain (C10; C1-C9 regression pass)
- [x] Revision 2: route-shaped peek held by viewing angle, explicit dismissal and caption-only "Where am I?" answer (plan: [docs/plans/glance-while-riding.md](docs/plans/glance-while-riding.md))
- [x] Preview realism: photographic surfaces, PBR shading and more detailed home, street and office geometry
- [x] Add Barcelona weekday departure advice and an independent traffic collector
- [x] Run C15 and capture the departure card in Interactive Preview
- [x] Record the Lens Studio demo and attach the MP4 to the README
- [ ] Devpost submission (deadline: Dec 7, 5:00 PM ET)

## The hackathon

Learn AR with SPECS asks participants to design an augmented reality app for glasses and let a coding agent build it in Lens Studio. The design is the hard part: good AR shares your view, draws content in the world at real size, and leaves your hands free, instead of being "a website floating in front of your face".

Entries are judged on four equally weighted criteria: **Design**, **Technical Implementation**, **Innovation/Idea** and **Presentation**. The submission is a public demo video (under 3 minutes, with a screen recording of the Lens Studio preview), this repository, and a short description. Details and dates are in [docs/submission.md](docs/submission.md).

## What I learned

_To be written._

## Credits and license

- [Lens Studio](https://ar.snap.com/lens-studio), Spectacles, CLAD, LEAF, the Lens Studio MCP server, the Spectacles Interaction Kit and UI Kit are by Snap Inc.
- The `plan-lens` skill and the hackathon are by Devpost.
- The Base Template, including its default scene, `Assets/Render/Echopark.hdr` and the Interaction Kit, UI Kit, Motion and Icons packages, is Snap's and remains subject to Snap's terms.
- Icons are [Material Symbols](https://fonts.google.com/icons) by Google (Apache License 2.0), imported through Snap's Icons package.
- `Assets/Tests/TrafficInsightLeafDriver.ts` adapts the "Custom Interactor Template" from Snap's LEAF package.
- The table and city map models and the sound effects were generated by code written for this project (`tools/asset-generators/`) and use no third-party assets. The Preview home, street, office and weather scenery are built procedurally by `TrafficInsightPreviewContext.ts`.
- Preview asphalt, concrete, wood and panoramic sky photographs are by [Poly Haven](https://polyhaven.com/), released under CC0. The [asset credits and manifest](Assets/Textures/PreviewSurfaces/README.md) identify each source. Preview PBR shaders and default material textures come from Lens Studio's native material presets.
- Code in this repository is released under the [MIT License](LICENSE).
