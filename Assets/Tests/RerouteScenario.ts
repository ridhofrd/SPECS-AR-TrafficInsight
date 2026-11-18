/**
 * RerouteScenario.ts — LEAF scenario C4 (design brief, done criterion 4).
 *
 * "I've stopped" after the crash alert shows the rest of route A with the crash
 * stretch highlighted and a delay card, plus route B. Pinching route B's dot
 * says "New route set" and hides the map; riding to the end gives the on-time
 * arrival line.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, leafLog, snap, visibleLensFlags } from "./TrafficInsightLeafDriver";

@component
export class RerouteScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        await driver.planMorningTrip();
        await driver.press(BUTTON_NAMES.routeDotA);
        await driver.rideUntilAlert();
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);

        let s = snap();
        leafLog("stopped card='" + s.problemCardText + "' labelA='" + s.labelTextA + "' labelB='" + s.labelTextB + "'");
        expect(s.state, "state after I've stopped").toBe("Stopped");
        expect(s.remainingFrom, "rest of route drawn from the rider's progress").toBeGreaterThan(0);
        expect(s.visible.map, "map visible").toBe(true);
        expect(s.visible.routeA, "rest of route A drawn").toBe(true);
        expect(s.visible.problemHighlight, "crash stretch highlighted").toBe(true);
        expect(s.visible.problemCard, "delay card visible").toBe(true);
        expect(s.problemCardText, "delay card text").toBe("Crash, traffic stalled, +18 min");
        expect(s.visible.routeB, "route B drawn").toBe(true);
        expect(s.visible.dotB, "route B dot visible").toBe(true);
        expect(s.recommendedRoute, "recommended after the crash").toBe("B");
        expect(s.labelTextB.includes("Recommended"), "label B marked Recommended").toBe(true);

        await driver.press(BUTTON_NAMES.routeDotB);
        s = snap();
        expect(s.lastCaption, "caption after pinching dot B").toBe("New route set");
        expect(s.lastAudioCue, "route-set tone").toBe("RouteSetTone");
        expect(s.visible.map, "map hidden after reroute").toBe(false);
        expect(visibleLensFlags(s).length, "Lens layer empty after reroute").toBe(0);
        expect(s.state, "riding again").toBe("Riding");
        expect(s.activeRoute, "now on route B").toBe("B");

        let presses = 0;
        while (snap().state === "Riding" && presses < 30) {
            await driver.press(BUTTON_NAMES.ride, 80);
            presses++;
        }
        s = snap();
        leafLog("arrived after " + presses + " Ride presses, caption='" + s.lastCaption + "'");
        expect(s.state, "state at the end of the trip").toBe("Arrived");
        expect(s.progress, "progress at arrival").toBeCloseTo(1, 3);
        expect(s.lastCaption, "arrival line").toBe("You've arrived, on time.");
        expect(s.lastAudioCue, "arrival tone").toBe("ArrivedTone");
        leafLog("C4 done");
    }
}
