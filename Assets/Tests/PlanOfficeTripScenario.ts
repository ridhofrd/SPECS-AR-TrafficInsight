/**
 * PlanOfficeTripScenario.ts — LEAF scenario C1 (design brief, done criterion 1).
 *
 * "Go to office" shows the map on the virtual table with two routes; each has a
 * dot and a label with time, fuel and weather; exactly one is "Recommended";
 * pinching a dot picks that route and hides the map.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, leafLog, snap, visibleLensFlags } from "./TrafficInsightLeafDriver";

@component
export class PlanOfficeTripScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        let s = snap();
        expect(s.state, "initial state").toBe("Planning");
        expect(s.planningStep, "initial planning step").toBe("idle");
        expect(s.visible.map, "map hidden before a trip is picked").toBe(false);

        // Go to office -> clarifying question ("Which office?")
        await driver.press(BUTTON_NAMES.goToOffice);
        s = snap();
        expect(s.planningStep, "step after Go to office").toBe("clarify");
        expect(s.visible.clarifyQuestion, "clarify question visible").toBe(true);
        expect(s.visible.map, "map still hidden while clarifying").toBe(false);

        // Main office -> map with two routes, two dots, two labels
        await driver.press(BUTTON_NAMES.mainOffice);
        s = snap();
        expect(s.state, "state after Main office").toBe("Planning");
        expect(s.planningStep, "step after Main office").toBe("map");
        expect(s.trip, "trip").toBe("morning");
        expect(s.office, "office").toBe("main");
        expect(s.visible.clarifyQuestion, "clarify question closed").toBe(false);
        expect(s.visible.map, "map visible").toBe(true);
        expect(s.visible.routeA, "route A drawn").toBe(true);
        expect(s.visible.routeB, "route B drawn").toBe(true);
        expect(s.visible.dotA, "dot A visible").toBe(true);
        expect(s.visible.dotB, "dot B visible").toBe(true);
        expect(s.visible.labelA, "label A visible").toBe(true);
        expect(s.visible.labelB, "label B visible").toBe(true);

        // The map sits on the virtual table.
        const table = findSceneObjectByName(ROOT_NAMES.mapTable);
        expect(!!table && table.isEnabledInHierarchy, "MapTable present and enabled").toBe(true);

        // Each label has time, fuel and weather; exactly one says Recommended (A).
        leafLog("labelA=" + s.labelTextA);
        leafLog("labelB=" + s.labelTextB);
        for (const [name, text] of [
            ["A", s.labelTextA],
            ["B", s.labelTextB],
        ]) {
            expect(text.includes("min total"), "label " + name + " makes whole-trip time explicit: " + text).toBe(true);
            expect(text.includes("Fuel:"), "label " + name + " has Fuel: " + text).toBe(true);
            expect(text.includes("Dry"), "label " + name + " has weather: " + text).toBe(true);
        }
        const recCount = [s.labelTextA, s.labelTextB].filter((t) => t.includes("Fastest:")).length;
        expect(recCount, "exactly one label explains the recommendation as Fastest").toBe(1);
        expect(s.labelTextA.includes("Fastest:"), "route A is the fastest one").toBe(true);
        expect(s.recommendedRoute, "recommendedRoute").toBe("A");
        const start = findSceneObjectByName(ROOT_NAMES.homeMarker).getTransform().getLocalPosition();
        const destination = findSceneObjectByName("OfficeMarker").getTransform().getLocalPosition();
        expect(destination.z, "destination lies ahead of the start on the heading-up map").toBeLessThan(start.z);

        // Pinch route A's dot -> route picked, map hidden, riding.
        await driver.press(BUTTON_NAMES.routeDotA);
        s = snap();
        expect(s.state, "state after pinching dot A").toBe("Riding");
        expect(s.activeRoute, "active route").toBe("A");
        expect(s.lastCaption, "caption after pinching dot A").toBe("Route A set. Ride safe.");
        expect(s.lastAudioCue, "audio cue after pinching dot A").toBe("RouteSetTone");
        expect(s.visible.map, "map hidden after picking a route").toBe(false);
        expect(visibleLensFlags(s).length, "Lens layer empty after picking: " + visibleLensFlags(s).join(",")).toBe(0);
        leafLog("C1 done");
    }
}
