/** C12: visibility follows viewing direction, without a duration cap. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { spentGlance, stepGlance } from "../Scripts/TrafficInsightGlanceTrigger";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { snap, TrafficInsightLeafDriver } from "./TrafficInsightLeafDriver";

@component
export class GlanceViewingAngleScenario extends Scenario {
    async run(): Promise<void> {
        // Advance the real pure trigger by an hour: no hidden timeout remains.
        let t = stepGlance(spentGlance(), 0, 0, true);
        t = stepGlance(t.state, 0, 0.6, true);
        t = stepGlance(t.state, 25, 1, true);
        t = stepGlance(t.state, 25, 1.4, true);
        t = stepGlance(t.state, 25, 3601.4, true);
        expect(t.visible && t.opacity === 1, "holding the viewing angle has no time bound").toBe(true);

        const d = new TrafficInsightLeafDriver();
        await d.waitForLens();
        const main = TrafficInsightMain.getInstance();
        const pitch = async (deg: number, ms: number) => { main.setHeadPitchOverrideForTests(deg); await sleep(ms); };
        try {
            main.setHeadYawOverrideForTests(0);
            await d.planMorningTrip();
            await d.press(BUTTON_NAMES.routeDotB);
            await pitch(0, 650);
            await pitch(15, 550);
            expect(snap().glance, "subthreshold tilt never opens").toBe(false);
            await pitch(25, 550);
            expect(snap().visible.glanceStrip, "deliberate look opens").toBe(true);
            await pitch(15, 200);
            expect(snap().visible.glanceStrip, "pitch hysteresis avoids flicker").toBe(true);
            await pitch(25, 3500);
            expect(snap().visible.glanceStrip, "actual map stays visible past the old two-second cap").toBe(true);
            main.setHeadYawOverrideForTests(35); await sleep(400);
            expect(snap().visible.glanceStrip, "looking aside hides the map").toBe(false);
            main.setHeadYawOverrideForTests(0); await sleep(550);
            expect(snap().visible.glanceStrip, "looking back into the map direction reopens it").toBe(true);
            await pitch(55, 400);
            expect(snap().visible.glanceStrip, "looking past the map vertically hides it").toBe(false);
            await pitch(25, 550);
            expect(snap().visible.glanceStrip, "returning to the viewing angle opens it").toBe(true);
            const before = snap();
            await d.press(BUTTON_NAMES.hideRoute);
            expect(snap().glance || snap().visible.glanceStrip, "explicit Hide route dismisses immediately").toBe(false);
            expect(snap().progress, "dismissal preserves the journey").toBe(before.progress);
            await pitch(25, 650);
            expect(snap().glance, "explicit dismissal is respected while still looking down").toBe(false);
            await pitch(0, 650);
            await pitch(25, 550);
            expect(snap().visible.glanceStrip, "fresh level look re-arms after dismissal").toBe(true);
            await pitch(0, 400);
            expect(snap().visible.glanceStrip, "looking straight hides the map").toBe(false);
        } finally { main.setHeadPitchOverrideForTests(null); main.setHeadYawOverrideForTests(null); }
    }
}
