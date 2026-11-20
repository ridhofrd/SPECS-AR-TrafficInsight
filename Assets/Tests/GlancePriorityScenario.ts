/** C14: alerts and state changes dismiss a glance without a lingering fade. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { TrafficInsightStateMachine } from "../Scripts/TrafficInsightState";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { snap, TrafficInsightLeafDriver } from "./TrafficInsightLeafDriver";

@component
export class GlancePriorityScenario extends Scenario {
    async run(): Promise<void> {
        const domain = new TrafficInsightStateMachine();
        domain.goToOffice(); domain.answerOffice("main"); domain.chooseRoute("A"); domain.ride(0.1);
        const warning = domain.getCore().lastCaption;
        domain.whereAmI(); domain.glanceStart();
        expect(domain.getCore().lastCaption, "voice request cannot overwrite an alert").toBe(warning);
        expect(domain.getCore().glance, "domain rejects a glance while alerted").toBe(false);

        const d = new TrafficInsightLeafDriver();
        await d.waitForLens();
        const main = TrafficInsightMain.getInstance();
        const down = async () => { main.setHeadPitchOverrideForTests(25); await sleep(550); };
        try {
            await down();
            expect(snap().visible.glanceStrip, "planning blocks look-down").toBe(false);
            await d.planMorningTrip();
            await d.press(BUTTON_NAMES.routeDotA);
            await sleep(650);
            expect(snap().glance, "entering Riding while tilted cannot open").toBe(false);
            main.setHeadPitchOverrideForTests(0); await sleep(650);
            await down();
            expect(snap().visible.glanceStrip, "glance before crash").toBe(true);
            await d.rideUntilAlert();
            expect(snap().visible.glanceStrip || snap().glance, "alert cancels immediately").toBe(false);
            expect(snap().visible.alertIcon, "alert wins the view").toBe(true);
            await d.waitForState("Riding", 4000);
            await sleep(650);
            expect(snap().glance, "alert expiry does not reopen while tilted").toBe(false);
            main.setHeadPitchOverrideForTests(0); await sleep(650);
            await down();
            expect(snap().visible.glanceStrip, "fresh level look re-arms after alert").toBe(true);
            await d.press(BUTTON_NAMES.stopped, 0);
            expect(snap().visible.glanceStrip || snap().glance, "stop cancels immediately").toBe(false);
            await down();
            expect(snap().glance, "stopped blocks look-down").toBe(false);
            await d.press(BUTTON_NAMES.routeDotB);
            await d.waitForRidingAfterPick();
            await sleep(650);
            expect(snap().glance, "reroute while tilted does not reopen").toBe(false);
            for (let i=0;snap().progress < 0.95 && i<25;i++) await d.press(BUTTON_NAMES.ride, 0);
            main.setHeadPitchOverrideForTests(0); await sleep(650);
            await down();
            expect(snap().visible.glanceStrip, "active glance immediately before arrival").toBe(true);
            await d.press(BUTTON_NAMES.ride, 0);
            expect(snap().state, "arrival reached").toBe("Arrived");
            expect(snap().glance || snap().visible.glanceStrip, "arrival cancels immediately").toBe(false);
            await down();
            expect(snap().glance || snap().visible.glanceStrip, "arrival blocks look-down").toBe(false);
            await d.press(BUTTON_NAMES.goHome);
            await down();
            expect(snap().glance, "new planning trip blocks look-down").toBe(false);
        } finally { main.setHeadPitchOverrideForTests(null); }
    }
}
