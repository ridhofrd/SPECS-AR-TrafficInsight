/** C12: dwell, hysteresis, full visual cap and deliberate re-arm. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { snap, TrafficInsightLeafDriver } from "./TrafficInsightLeafDriver";

@component
export class GlanceCapScenario extends Scenario {
    async run(): Promise<void> {
        const d = new TrafficInsightLeafDriver();
        await d.waitForLens();
        const main = TrafficInsightMain.getInstance();
        const pitch = async (deg: number, ms: number) => { main.setHeadPitchOverrideForTests(deg); await sleep(ms); };
        try {
            await d.planMorningTrip();
            await d.press(BUTTON_NAMES.routeDotB);
            await pitch(0, 650);
            await pitch(15, 550);
            expect(snap().glance, "subthreshold tilt never opens").toBe(false);
            await pitch(25, 550);
            expect(snap().visible.glanceStrip, "deliberate look opens").toBe(true);
            await pitch(15, 200);
            expect(snap().visible.glanceStrip, "hysteresis keeps a small pitch change from flickering").toBe(true);
            await pitch(25, 1900);
            expect(snap().visible.glanceStrip || snap().glance, "two-second cap includes fade").toBe(false);
            await pitch(25, 1800);
            expect(snap().glance, "held-down look cannot repeat").toBe(false);
            await pitch(0, 300);
            await pitch(25, 600);
            expect(snap().glance, "brief level look does not re-arm").toBe(false);
            await pitch(0, 650);
            expect(snap().glancePhase, "level look re-arms").toBe("Ready");
            await pitch(25, 550);
            expect(snap().visible.glanceStrip, "fresh deliberate look opens again").toBe(true);
            await pitch(0, 400);
            expect(snap().visible.glanceStrip, "early look-up completes fade").toBe(false);
        } finally { main.setHeadPitchOverrideForTests(null); }
    }
}
