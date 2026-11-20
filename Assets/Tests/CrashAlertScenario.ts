/**
 * CrashAlertScenario.ts — LEAF scenario C3 (design brief, done criterion 3).
 *
 * At the crash point a chime plays, the alert sentence plays and shows as a
 * caption, and a small icon appears low in the view, off-centre, then
 * disappears after about 2 seconds. Audibility itself cannot be asserted; the
 * scenario checks the recorded cue (lastAudioCue) and the caption.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import {
    TrafficInsightLeafDriver,
    leafLog,
    simulatorShowsCaption,
    snap,
    visibleLensFlags,
} from "./TrafficInsightLeafDriver";

const CRASH_LINE = "Crash ahead on your route, traffic is stalled. Pull over to see options.";

@component
export class CrashAlertScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        await driver.planMorningTrip();
        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, "riding on route A").toBe("Riding");

        // The alert is at 25% of the route and each Ride press is 5%: four quiet presses, the fifth crosses 25% -> Alerted.
        for (let i = 1; i <= 4; i++) {
            await driver.press(BUTTON_NAMES.ride, 100);
            expect(snap().state, "no alert after Ride press " + i).toBe("Riding");
        }
        await driver.press(BUTTON_NAMES.ride, 0);
        const alertSeenAt = getTime();

        let s = snap();
        leafLog(
            "alert state=" + s.state + " cue=" + s.lastAudioCue + " icon=" + JSON.stringify(s.alertIconCameraLocal)
        );
        expect(s.state, "state at the crash point").toBe("Alerted");
        expect(s.alertFired, "alertFired").toBe(true);
        expect(s.alertKind, "alertKind").toBe("crash");
        expect(s.lastAudioCue, "chime cue").toBe("AlertChime");
        expect(s.lastCaption, "alert sentence caption").toBe(CRASH_LINE);
        expect(simulatorShowsCaption(CRASH_LINE), "caption shown on the Ride simulator").toBe(true);

        // Small icon, low and off-centre; nothing else from the Lens.
        expect(s.visible.alertIcon, "alert icon visible").toBe(true);
        const shown = visibleLensFlags(s).filter((k) => k !== "alertIcon");
        expect(shown.length, "other Lens flags during alert: " + shown.join(",")).toBe(0);
        const icon = s.alertIconCameraLocal;
        expect(icon.y, "icon below eye line (camera-local y)").toBeLessThan(0);
        expect(Math.abs(icon.x), "icon off-centre (|camera-local x|)").toBeGreaterThan(0);
        expect(icon.z, "icon in front of the camera (camera-local z)").toBeLessThan(0);

        // Still alerted a moment later (input ignored by design while Alerted).
        await sleep(800);
        s = snap();
        expect(s.state, "still Alerted at ~0.8 s").toBe("Alerted");
        expect(s.visible.alertIcon, "icon still visible at ~0.8 s").toBe(true);

        // Gone after about 2 s.
        await driver.waitForState("Riding", 4000);
        const elapsed = getTime() - alertSeenAt;
        await sleep(100);
        s = snap();
        leafLog("alert lasted ~" + elapsed.toFixed(2) + " s");
        expect(elapsed, "alert duration (s)").toBeGreaterThan(1.5);
        expect(elapsed, "alert duration (s)").toBeLessThan(3.0);
        expect(s.visible.alertIcon, "alert icon gone after ~2 s").toBe(false);
        expect(s.state, "back to Riding").toBe("Riding");
        expect(visibleLensFlags(s).length, "Lens layer empty after the alert").toBe(0);
        leafLog("C3 done");
    }
}
