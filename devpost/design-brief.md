---
status: approved
---

# Design brief: TrafficInsight

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
I'm riding my motorcycle to the office on route A. A chime plays and a short voice says a crash ahead has stalled traffic and to pull over to see options. I pull over, and the full map appears: the rest of my route with the crash stretch highlighted, and route B beside it, both compared by time, fuel and weather. I pinch route B, a voice says the new route is set, the map goes away, and I ride on and get to the office on time.

The demo tells this as one day, in two trips that reuse the same map, alert and stop:
1. **Morning, at home:** the map on the table shows the trip to the office with time, fuel and the other important info. I pick a route.
2. **On the road:** nothing on screen. Then the crash alert, pull over, reroute, arrive on time.
3. **Evening, going home:** I see the route again and ride. A rain alert comes before the rain zone. I pull over, see where the rain is and how bad it is, and either take the dry reroute or stay on my route and put on my raincoat. I ride through the rain prepared, and that's the happy part: being warned in time.

## Why it belongs on glasses
- Uses: leaves your body free, draws in the world.
- Why it's better than the phone or laptop version: while riding, my hands are on the handlebars and my eyes must stay on the road, so I can't use a phone. And I want to see the routes laid out in my space, not on a small flat map.

## Product or overlay
- Type: overlay. It responds to the real road, real traffic and real weather on my commute.
- What the real version would sense: my location and speed (GPS), whether I've stopped, live traffic and incidents (crashes), live weather along the route, and my voice ("office", "route B").
- Stand-in for the preview: see the table below. The rule the learner set: we know what the product should be. Anything the preview can't do becomes a button or another simple input, and the README and video say so truthfully.

| Real product | Preview stand-in |
|---|---|
| I say "office", or use a saved shortcut | A "Go to office" button (morning) and a "Go home" button (evening) |
| If my destination is unclear, it asks which one I mean | One hard-coded clarifying question, "Which office: Main office or Branch office?", with a button for each (default wording) |
| GPS follows me along the road | A **Ride simulator** panel: a button moves my position along the route (default) |
| The Lens detects that I've pulled over | An "I've stopped" button on the Ride simulator panel |
| Live traffic and crash reports | Hard-coded: a crash on morning route A that adds +18 min (default number) |
| Live weather along the route | Hard-coded: rain on evening route A between km 4 and 7, 24 °C, heavy, "windy rain" (temperature, intensity and type are defaults) |
| Route time and fuel from a routing service | Hard-coded sample values for 2 routes per trip (default numbers) |
| Choosing a route by voice ("route B") | A button for every voice command, next to the pinch dots |
| The map lies flat on a real table or wall, or floats about 1 m in front of me if there's no flat surface | A virtual table in the room |
| Spoken alerts and confirmations | Spoken audio if it works in the preview. The same sentence also shows as a caption on the Ride simulator panel, so the demo never depends on it (default) |

**Two layers in the scene.** The *Lens* is what the rider would see on real glasses. The *Ride simulator* is demo scaffolding that only exists because the preview has no road. Keep them clearly separate: the simulator panel sits off to one side, labeled "Ride simulator (preview only)" (default). The "nothing on screen while riding" rule applies to the Lens layer only.

## Where things live
- Where the user is looking during the main task: in the stopped state, down at the map on the table in front of them. While riding, straight ahead at the road.
- **Route map:** flat on a virtual table, about 60 × 40 cm (default), table top about 75 cm high (default), about 1 m in front of the user's start position (default) and a little below eye level. A simple, light-colored city map: roads as thin light lines, routes as thicker colored lines raised slightly off the map. No dark backgrounds, because black renders as transparent.
- **Route dots:** one big dot per route, about 4 cm across (default). Each sits on its own route line where the routes are furthest apart (default).
- **Route labels:** a small card next to each dot showing that route's time, fuel and weather. The recommended route (best time first, then fuel) is marked "Recommended".
- **Problem stretch highlight:** the crashed or rainy part of the remaining route gets a border or glow along the line.
- **Problem card:** sits on the highlighted stretch. Crash: "Crash, traffic stalled, +18 min" (default wording). Rain: temperature, rain intensity, and type (storm, windy rain, light rain).
- **Raincoat reminder:** a small panel just above the map, near the chosen route, with "Proceed" and "Raincoat on" buttons.
- **Alert icon:** small, about 4 cm (default), low in the view and never in the center, about 1 m away (default). It gently follows where the user looks so it stays in view (default).
- **Ride simulator panel:** to the user's right, about 1 m away, angled toward them (default). It holds a route progress bar, the "Ride" button, the "I've stopped" button, the trip buttons, the voice-command buttons and the caption line.

## Hands and input
- Choose destination: pinch "Go to office" or "Go home" (stand-ins for voice or a saved shortcut). If the destination is unclear, pinch the answer to the clarifying question.
- Choose a route: pinch the route's dot. Dragging isn't needed.
- Raincoat reminder: pinch "Proceed" or "Raincoat on".
- Simulate the ride: pinch "Ride" on the Ride simulator to move along the route, and "I've stopped" to pull over.
- Targets are big and highlight when aimed at.
- Voice and the button that does the same job: "office" or "home" = the trip buttons; "route A" or "route B" = a "Choose route A" or "Choose route B" button on the simulator panel, plus the dots themselves; "proceed" or "raincoat on" = the reminder buttons.
- Alerted state: no hand input, voice only (learner's safety rule).

## When things show
Three states, for safety:

```mermaid
stateDiagram-v2
    [*] --> Planning
    Planning --> Riding: pick a route
    Riding --> Alerted: crash or rain ahead on the route
    Alerted --> Riding: icon fades after about 2 s
    Riding --> Stopped: "I've stopped"
    Stopped --> Riding: pick a route (or Proceed / Raincoat on)
    Riding --> Arrived: end of route
    Arrived --> Planning: "Go home"
```

- **Planning (at home or at the office):** the map shows the whole trip with route dots and labels. Hides once a route is picked.
- **Riding:** nothing from the Lens on screen, only short voice cues. Audio must not drown out traffic.
- **Alerted:** a chime plus one short sentence, and the small icon low in the view, which disappears after about 2 seconds. Morning: "Crash ahead on your route, traffic is stalled. Pull over to see options." (default wording). Evening: "Rain on your route in 10 minutes. Pull over to see options." Keep the tone calm (default).
- **Stopped:** the full picture. The rest of the route with the problem stretch highlighted, the problem card, and a dot and label for each option. Morning: current route A and reroute B. Evening: the dry reroute (when available; in the sample data it is, at +12 min, a default number) and the rainy route.
- **After choosing:** a voice says "New route set" (default wording) and the map hides, so you're back to riding.
- **Raincoat reminder:** shows only if the rainy route is chosen. Hides when "Proceed" or "Raincoat on" is pinched, and everything goes back to normal riding.
- **Arrived:** a short voice line, "You've arrived, on time." (default wording). Nothing stays on screen.
- If something needs attention out of view: the chime and voice do that job; the map only appears when the rider has stopped.

## Done criteria
Each one can be checked in Lens Studio's preview. Drafted from the learner's story, so confirm at review.
1. Pressing "Go to office" shows the map on the virtual table with two routes. Each has a big dot and a label with time, fuel and weather, and one is marked "Recommended". Pinching a dot picks that route and the map hides.
2. While riding, pressing "Ride" moves the progress bar on the Ride simulator, and nothing from the Lens is in view until an alert.
3. At the crash point a chime plays, the alert sentence plays (and shows as a caption), and a small icon appears low in the view, not in the center, then disappears after about 2 seconds.
4. Pressing "I've stopped" after the crash alert shows the rest of route A with the crash stretch highlighted and a delay card, plus route B. Pinching route B's dot plays "New route set" and hides the map, and riding on to the end plays the on-time arrival line.
5. On the evening trip, after the rain alert, pressing "I've stopped" shows the rainy stretch highlighted with a card for temperature, rain intensity and type. Pinching the rainy route's dot shows the raincoat reminder, and pinching "Proceed" or "Raincoat on" hides it and returns to riding.

## Out of scope
- Real GPS, real navigation, live traffic and live weather (all hard-coded sample data).
- Turn-by-turn directions while riding.
- Detecting a real table or wall, and the floating fallback when there's no surface (the preview uses a virtual table).
- Relying on voice recognition (every voice command has a button).
- Editing saved shortcuts.
- Data analytics, such as the best time to leave based on history.
- Mood music. (Calm wording in the alert voice is in scope.)
- Separate modes for cars or bicycles.

## Risks and open questions
- **Riding with AR glasses is unproven.** The learner's research note found no study of AR glasses on motorcycles or bicycles, and no Snap guidance about vehicles. The three-state design follows car and helmet-HUD evidence, but whether it's safe on a real bike is feel unproven and only real-world testing could tell. The video should say this.
- **Two trips is a lot to build.** Both reuse the same map, alert and stop, so the evening trip should be mostly new sample data. Build the morning trip end to end first.
- **Spoken audio may not work in the preview.** Captions on the simulator panel are the fallback.
- **Viewers may confuse the demo rig with the Lens.** Keep the Ride simulator clearly labeled and to the side.
- **The alert icon follows the view.** Content that sticks to the face is usually avoided. It's kept here because it's tiny, low and gone in 2 seconds. How it feels while moving is unproven.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
