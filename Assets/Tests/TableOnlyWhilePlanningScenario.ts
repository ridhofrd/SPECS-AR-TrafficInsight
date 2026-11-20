/**
 * TableOnlyWhilePlanningScenario.ts — LEAF scenario C6 (design brief, done criterion 6).
 *
 * The virtual table is visible during the whole Planning state (at the start,
 * while the clarifying question is shown, and under the map) and hidden in every
 * other state: Riding, Alerted, Stopped and Arrived. Each checkpoint reads both
 * the snapshot flag and the real MapTable object in the scene.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, leafLog, snap } from "./TrafficInsightLeafDriver";

function expectTable(label: string, shown: boolean): void {
    const s = snap();
    const table = findSceneObjectByName(ROOT_NAMES.mapTable);
    expect(s.visible.table, label + ": table flag").toBe(shown);
    expect(!!table && table.isEnabledInHierarchy, label + ": MapTable object enabled").toBe(shown);
    leafLog("table " + (shown ? "visible" : "hidden") + " in " + label + " (state=" + s.state + ")");
}

@component
export class TableOnlyWhilePlanningScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        // Planning: start, clarifying question, map.
        expect(snap().state, "initial state").toBe("Planning");
        expectTable("Planning at the start", true);

        await driver.press(BUTTON_NAMES.goToOffice);
        expect(snap().visible.clarifyQuestion, "clarifying question is showing").toBe(true);
        expectTable("Planning, clarifying question", true);

        await driver.press(BUTTON_NAMES.mainOffice);
        expect(snap().visible.map, "map is showing").toBe(true);
        expectTable("Planning, map on the table", true);

        // Riding.
        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, "state after picking route A").toBe("Riding");
        expectTable("Riding", false);

        // Alerted.
        await driver.rideUntilAlert();
        expectTable("Alerted", false);

        // Riding again, then Stopped.
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);
        expect(snap().state, "state after I've stopped").toBe("Stopped");
        expect(snap().visible.map, "map floats while stopped").toBe(true);
        expectTable("Stopped", false);

        // Back to Riding, then Arrived.
        await driver.press(BUTTON_NAMES.routeDotB);
        expect(snap().state, "state after rerouting").toBe("Riding");
        expectTable("Riding after the reroute", false);

        let presses = 0;
        while (snap().state === "Riding" && presses < 30) {
            await driver.press(BUTTON_NAMES.ride, 80);
            presses++;
        }
        expect(snap().state, "state at the end of the trip").toBe("Arrived");
        expectTable("Arrived", false);

        // Arrived -> Planning ("Go home"): the table comes back.
        await driver.press(BUTTON_NAMES.goHome);
        expect(snap().state, "state after Go home").toBe("Planning");
        expectTable("Planning, evening trip", true);
        leafLog("C6 done");
    }
}
