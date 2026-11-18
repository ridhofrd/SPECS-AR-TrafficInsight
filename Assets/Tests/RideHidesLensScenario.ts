/**
 * RideHidesLensScenario.ts — LEAF scenario C2 (design brief, done criterion 2).
 *
 * While riding, "Ride" moves the Ride simulator's progress, and nothing from the
 * Lens is in view until an alert.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import {
    TrafficInsightLeafDriver,
    leafLog,
    simulatorProgressText,
    snap,
    visibleLensFlags,
} from "./TrafficInsightLeafDriver";

@component
export class RideHidesLensScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        await driver.planMorningTrip();
        await driver.press(BUTTON_NAMES.routeDotA);
        let s = snap();
        expect(s.state, "state after picking route A").toBe("Riding");

        const progressBefore = s.progress;
        const textBefore = simulatorProgressText();
        leafLog("progress before=" + progressBefore + " text='" + textBefore + "'");
        expect(textBefore.length > 0, "simulator progress text found").toBe(true);

        await driver.press(BUTTON_NAMES.ride);
        s = snap();
        const textAfter = simulatorProgressText();
        leafLog("progress after=" + s.progress + " text='" + textAfter + "'");

        expect(s.state, "still riding after one Ride press").toBe("Riding");
        expect(s.progress, "progress after one Ride press").toBeCloseTo(progressBefore + 0.05, 3);
        expect(textAfter, "simulator progress text").toBe("Office trip: 5%");
        expect(textAfter !== textBefore, "progress text moved ('" + textBefore + "' -> '" + textAfter + "')").toBe(true);

        // Nothing from the Lens in view while riding (before the alert).
        const shown = visibleLensFlags(s);
        expect(shown.length, "Lens flags visible while riding: " + shown.join(",")).toBe(0);
        expect(s.visible.clarifyQuestion, "clarify dialog hidden while riding").toBe(false);
        expect(s.alertFired, "no alert yet").toBe(false);
        leafLog("C2 done");
    }
}
