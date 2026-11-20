/**
 * RainRaincoatScenario.ts — LEAF scenario C5 (design brief, done criterion 5).
 *
 * Evening trip: after the rain alert, "I've stopped" shows the rainy stretch
 * highlighted with a card for temperature, rain intensity and type. Pinching
 * the rainy route's dot shows the raincoat reminder; "Proceed" or "Raincoat on"
 * hides it and returns to riding.
 *
 * Parameter 'resolve': "both" (default) runs the Proceed path, rides to the end,
 * starts a second evening trip and runs the Raincoat on path. "proceed" or
 * "raincoatOn" runs only that path.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, cameraObject, leafLog, snap, visibleLensFlags } from "./TrafficInsightLeafDriver";

const RAIN_LINE = "Rain on your route in 8 minutes. Pull over to see options.";

@component
export class RainRaincoatScenario extends Scenario {
    async run(config?: ScenarioConfig): Promise<void> {
        const mode = (config && config.get("resolve")) || "both";
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        if (mode === "both" || mode === "proceed") {
            await this.rainStop(driver, "first");
            await this.resolve(driver, BUTTON_NAMES.proceed, "Continuing on route A through rain.");
        }

        if (mode === "both") {
            // Finish the first trip so a new one can start.
            let presses = 0;
            while (snap().state === "Riding" && presses < 30) {
                await driver.press(BUTTON_NAMES.ride, 80);
                presses++;
            }
            expect(snap().state, "first evening trip arrived").toBe("Arrived");
        }

        if (mode === "both" || mode === "raincoatOn") {
            await this.rainStop(driver, mode === "both" ? "second" : "first");
            await this.resolve(driver, BUTTON_NAMES.raincoatOn, "Raincoat on. Ride safe.");
        }
        leafLog("C5 done (resolve=" + mode + ")");
    }

    /** Go home -> route A -> rain alert -> I've stopped -> pinch dot A -> reminder. */
    private async rainStop(driver: TrafficInsightLeafDriver, which: string): Promise<void> {
        await driver.press(BUTTON_NAMES.goHome);
        let s = snap();
        expect(s.trip, which + " trip: trip after Go home").toBe("evening");
        expect(s.planningStep, which + " trip: step after Go home").toBe("map");
        const start = findSceneObjectByName("OfficeMarker").getTransform().getLocalPosition();
        const destination = findSceneObjectByName("HomeMarker").getTransform().getLocalPosition();
        expect(destination.z, which + " trip: home destination is ahead, matching the road view").toBeLessThan(start.z);

        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, which + " trip: riding route A").toBe("Riding");

        await driver.rideUntilAlert();
        s = snap();
        expect(s.alertKind, which + " trip: alert kind").toBe("rain");
        expect(s.lastCaption, which + " trip: rain alert line").toBe(RAIN_LINE);
        expect(s.lastAudioCue, which + " trip: chime").toBe("AlertChime");
        await driver.waitForState("Riding", 4000);

        await driver.press(BUTTON_NAMES.stopped);
        s = snap();
        leafLog(which + " trip card='" + s.problemCardText + "'");
        expect(s.state, which + " trip: state after I've stopped").toBe("Stopped");
        expect(s.visible.problemHighlight, which + " trip: rainy stretch highlighted").toBe(true);
        expect(s.visible.problemCard, which + " trip: rain card visible").toBe(true);
        expect(s.problemCardText.includes("24 °C"), which + " trip: card temperature").toBe(true);
        expect(s.problemCardText.includes("heavy"), which + " trip: card rain intensity").toBe(true);
        expect(s.problemCardText.includes("windy rain"), which + " trip: card rain type").toBe(true);
        expect(s.problemCardText.includes("rain in 8 min"), which + " trip: rain card and warning agree").toBe(true);
        expect(s.labelTextA.includes("Current") && s.labelTextA.includes("Fastest:"), which + " trip: A is explicitly the current, fastest route").toBe(true);
        expect(s.labelTextB.includes("+12 min") && s.labelTextB.includes("Dry"), which + " trip: dry option explains the time trade-off").toBe(true);
        expect(s.visible.dotA, which + " trip: rainy route dot visible").toBe(true);

        await driver.press(BUTTON_NAMES.routeDotA);
        s = snap();
        expect(s.state, which + " trip: still Stopped at the reminder").toBe("Stopped");
        expect(s.raincoatPrompt, which + " trip: raincoatPrompt").toBe(true);
        expect(s.visible.raincoatReminder, which + " trip: raincoat reminder visible").toBe(true);
        expect(s.lastCaption, which + " trip: reminder caption").toBe("Route A: rain ahead. Put on your raincoat before riding.");
        const camera = cameraObject().getComponent("Component.Camera") as Camera;
        for (const name of [BUTTON_NAMES.proceed, BUTTON_NAMES.raincoatOn]) {
            const transform = findSceneObjectByName(name).getTransform().getWorldTransform();
            for (const x of [-4.5, 4.5]) for (const y of [-1.4, 1.4]) {
                const screen = camera.worldSpaceToScreenSpace(transform.multiplyPoint(new vec3(x, y, 0)));
                expect(screen.x > 0.02 && screen.x < 0.98 && screen.y > 0.02 && screen.y < 0.98,
                    name + " corner fully inside the view: " + screen.x + "," + screen.y).toBe(true);
            }
        }
    }

    private async resolve(driver: TrafficInsightLeafDriver, button: string, caption: string): Promise<void> {
        await driver.press(button);
        const s = snap();
        expect(s.visible.raincoatReminder, button + ": reminder hidden").toBe(false);
        expect(s.state, button + ": back to riding").toBe("Riding");
        expect(s.activeRoute, button + ": on route A").toBe("A");
        expect(s.lastCaption, button + ": caption").toBe(caption);
        expect(visibleLensFlags(s).length, button + ": Lens layer empty: " + visibleLensFlags(s).join(",")).toBe(0);
    }
}
