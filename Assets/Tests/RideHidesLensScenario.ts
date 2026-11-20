/**
 * RideHidesLensScenario.ts — LEAF scenario C2 (design brief, done criterion 2).
 *
 * While riding, "Ride" moves the Ride simulator's progress, and nothing from the
 * Lens is in view until an alert. That includes the virtual table: the flag in
 * the snapshot and the MapTable object in the scene are both off.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
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
        await driver.press(BUTTON_NAMES.routeDotB);
        let s = snap();
        expect(s.state, "state after picking route B").toBe("Riding");

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
        expect(s.visible.table, "table hidden while riding").toBe(false);
        const table = findSceneObjectByName(ROOT_NAMES.mapTable);
        expect(!!table && table.isEnabledInHierarchy, "MapTable object is off while riding").toBe(false);
        expect(s.visible.clarifyQuestion, "clarify dialog hidden while riding").toBe(false);
        expect(s.alertFired, "no alert yet").toBe(false);
        // Both sample hazards belong to A. B must complete either trip without
        // a false warning, a forced stop, or any Lens visuals appearing.
        await this.finishClearTrip(driver);
        await driver.press(BUTTON_NAMES.goHome);
        await driver.press(BUTTON_NAMES.routeDotB);
        await this.finishClearTrip(driver);
        leafLog("C2 done (both trips on unaffected route B)");
    }

    private async finishClearTrip(driver: TrafficInsightLeafDriver): Promise<void> {
        for (let i = 0; snap().state === "Riding" && i < 25; i++) {
            await driver.press(BUTTON_NAMES.ride, 0);
            expect(snap().alertFired, "no alert on unaffected route B").toBe(false);
            expect(visibleLensFlags(snap()).length, "clear ride has no Lens visuals").toBe(0);
        }
        expect(snap().state, "unaffected trip reaches its destination").toBe("Arrived");
    }
}
