/**
 * RoadViewScenario.ts — LEAF scenario C9 (design brief, done criterion 9).
 *
 * When stopped, both routes are also shown laid on the mock street ahead, in
 * vivid colours, with a pulsing ring where they split, and the street and the
 * map do not cover each other. Aiming at a route's dot, its "Choose route"
 * button or its line brightens that line. Pinching a line chooses that route,
 * the same as pinching its dot. Choosing a route makes its line glow and fades
 * the other. Riding hides all of it.
 *
 * Morning: layout, aiming, and pinching route B's side-road stripe (reroute:
 * its stripe glows and A's fades for a moment, then riding starts).
 * Evening: pinching route A's stripe asks about the raincoat and the chosen
 * stripe glows while the other fades.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import {
    TrafficInsightLeafDriver,
    convexOverlap,
    eyePosition,
    leafLog,
    snap,
    viewAngles,
    visibleLensFlags,
} from "./TrafficInsightLeafDriver";

const HOVER_MS = 900;

@component
export class RoadViewScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();
        const roadView = TrafficInsightMain.getInstance().roadView;

        // ---- Morning: the street is there and well laid out ----
        await driver.stopAfterCrash();
        let s = snap();
        expect(s.visible.road, "street visible while stopped").toBe(true);
        expect(s.visible.roadLineA, "route A stripe visible").toBe(true);
        expect(s.visible.roadLineB, "route B stripe visible").toBe(true);
        expect(s.visible.splitRing, "ring where the routes split visible").toBe(true);
        expect(!!findSceneObjectByName(ROOT_NAMES.roadSplitRing), "ring object exists").toBe(true);
        for (const name of [BUTTON_NAMES.roadLineA, BUTTON_NAMES.roadLineB, BUTTON_NAMES.roadLineBSide]) {
            expect(!!findInteractableByName(name, undefined, true), name + " can be aimed at and pinched").toBe(true);
        }

        // The street is ahead of the rider and the map does not cover it (nor it the map), as seen from where the rider stands.
        const mapRoot = findSceneObjectByName(ROOT_NAMES.mapRoot);
        const toWorld = mapRoot.getTransform().getWorldTransform();
        const mapCorners = [new vec3(-30, 0, -20), new vec3(30, 0, -20), new vec3(30, 0, 20), new vec3(-30, 0, 20)].map((p) =>
            toWorld.multiplyPoint(p)
        );
        const mapInView = mapCorners.map((p) => viewAngles(p));
        const footprints = roadView.getFootprints();
        expect(footprints.length, "street footprints reported").toBe(2);
        footprints.forEach((quad, i) => {
            for (const corner of quad) {
                expect(eyePosition().z - corner.z > 0, "street corner is in front of the rider").toBe(true);
            }
            const inView = quad.map((p) => viewAngles(p));
            leafLog("street part " + i + " in view (degrees right, up): " + inView.map((p) => "(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")").join(" "));
            expect(convexOverlap(mapInView, inView), "street part " + i + " does not overlap the floating map").toBe(false);
        });

        // The stripes are wide enough to aim at from where the rider stands (about 2 degrees or more at the near end).
        const nearest = Math.sqrt(roadView.nearDistanceCm * roadView.nearDistanceCm + roadView.floorYCm * roadView.floorYCm);
        const widthDeg = (2 * Math.atan(roadView.stripeWidthCm / 2 / nearest) * 180) / Math.PI;
        leafLog("stripe is " + widthDeg.toFixed(1) + " degrees wide at the near end (" + nearest.toFixed(0) + " cm away)");
        expect(widthDeg, "stripe is at least about 2 degrees wide at the near end").toBeGreaterThan(2);

        // ---- Aiming brightens the line: at the line, at its dot, at its Choose route button ----
        expect(snap().roadHighlight, "nothing highlighted at first").toBe("none");
        await this.expectAimHighlights(driver, BUTTON_NAMES.roadLineB, "B", "route B's line");
        await this.expectAimHighlights(driver, BUTTON_NAMES.routeDotA, "A", "route A's dot");
        await this.expectAimHighlights(driver, BUTTON_NAMES.chooseRouteB, "B", "the Choose route B button");

        // ---- Pinching a line chooses that route, the same as its dot ----
        await driver.press(BUTTON_NAMES.roadLineBSide);
        s = snap();
        expect(s.lastCaption, "caption after pinching route B's line").toBe("New route set");
        expect(s.lastAudioCue, "route-set tone").toBe("RouteSetTone");
        // The picked route glows and the other fades for a moment, with nothing left to pinch ...
        expect(s.state, "still stopped while the pick glows").toBe("Stopped");
        expect(s.roadChosen, "route B's stripe glows").toBe("B");
        expect(s.visible.roadLineA && s.visible.roadLineB, "both stripes still drawn while the pick glows").toBe(true);
        expect(!!findInteractableByName(BUTTON_NAMES.roadLineA, undefined, true), "the faded stripe cannot be pinched").toBe(false);
        expect(!!findInteractableByName(BUTTON_NAMES.roadLineB, undefined, true), "stripes cannot be pinched while the pick glows").toBe(false);
        // ... then riding starts.
        await driver.waitForRidingAfterPick();
        s = snap();
        expect(s.state, "riding again").toBe("Riding");
        expect(s.activeRoute, "now on route B").toBe("B");
        expect(visibleLensFlags(s).length, "Lens layer empty after choosing: " + visibleLensFlags(s).join(",")).toBe(0);
        expect(!!findInteractableByName(BUTTON_NAMES.roadLineA, undefined, true), "stripes cannot be pinched while riding").toBe(false);
        expect(!!findInteractableByName(BUTTON_NAMES.roadLineB, undefined, true), "stripes cannot be pinched while riding").toBe(false);

        // ---- Evening: choosing the rainy route makes its line glow and fades the other ----
        let presses = 0;
        while (snap().state === "Riding" && presses < 30) {
            await driver.press(BUTTON_NAMES.ride, 80);
            presses++;
        }
        expect(snap().state, "arrived after the morning trip").toBe("Arrived");
        await driver.press(BUTTON_NAMES.goHome);
        await driver.press(BUTTON_NAMES.routeDotA);
        await driver.rideUntilAlert();
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);
        s = snap();
        expect(s.state, "stopped on the evening trip").toBe("Stopped");
        expect(s.visible.road, "street visible on the evening trip").toBe(true);
        expect(s.roadChosen, "no route chosen yet").toBe("none");

        await driver.press(BUTTON_NAMES.roadLineA);
        s = snap();
        leafLog("after pinching route A's line: state=" + s.state + " chosen=" + s.roadChosen + " caption='" + s.lastCaption + "'");
        expect(s.state, "still stopped: the raincoat question").toBe("Stopped");
        expect(s.raincoatPrompt, "raincoat reminder asked").toBe(true);
        expect(s.visible.roadLineA && s.visible.roadLineB, "both stripes still drawn").toBe(true);
        expect(s.roadChosen, "route A's stripe is the chosen one (glows)").toBe("A");
        expect(!!findInteractableByName(BUTTON_NAMES.roadLineB, undefined, true), "the faded stripe cannot be pinched").toBe(false);

        await driver.press(BUTTON_NAMES.proceed);
        s = snap();
        expect(s.state, "riding after Proceed").toBe("Riding");
        expect(visibleLensFlags(s).length, "Lens layer empty after Proceed: " + visibleLensFlags(s).join(",")).toBe(0);
        expect(s.roadChosen, "nothing chosen once riding").toBe("none");
        leafLog("C9 done");
    }

    /** Aims at an interactable for a moment and checks which stripe is brightened, then that it clears. */
    private async expectAimHighlights(driver: TrafficInsightLeafDriver, name: string, route: string, what: string): Promise<void> {
        const target = findInteractableByName(name, undefined, true);
        expect(!!target, name + " found").toBe(true);
        const aiming = driver.hover(target, HOVER_MS);
        await sleep(HOVER_MS / 2);
        expect(snap().roadHighlight, "aiming at " + what + " brightens route " + route + "'s line").toBe(route);
        await aiming;
        await sleep(150);
        expect(snap().roadHighlight, "line returns to normal after aiming at " + what).toBe("none");
    }
}
