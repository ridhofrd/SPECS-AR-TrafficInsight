/** C13: the simulator's voice stand-in uses the same facts without a visual. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { glanceFacts, getTrip, remainingStats } from "../Scripts/TrafficInsightTripData";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { simulatorShowsCaption, snap, TrafficInsightLeafDriver, visibleLensFlags } from "./TrafficInsightLeafDriver";

@component
export class WhereAmIScenario extends Scenario {
    async run(): Promise<void> {
        // Numeric expectations catch a separate whole-trip-fraction calculation.
        expect(glanceFacts("morning", "B", 0.1, true).minutesLeft, "reroute keeps shared elapsed cost").toBe(38);
        expect(glanceFacts("morning", "A", 0.1, true).minutesLeft, "known crash includes remaining delay").toBe(50);
        expect(glanceFacts("evening", "A", 0.1, true).next, "same rain countdown as warning/card").toBe("Rain in 8 min");
        expect(glanceFacts("evening", "A", 0.1, false).problem, "unknown rain is not disclosed").toBe(null);
        const rain = getTrip("evening").problem;
        expect(glanceFacts("evening", "A", rain.fromFraction, true).next.indexOf("Rain ends in ") === 0, "rain entry uses end countdown").toBe(true);
        expect(glanceFacts("evening", "A", rain.toFraction, true).next, "rain exit is clear").toBe("Route clear");
        expect(glanceFacts("evening", "B", 0.1, true).problem, "dry reroute has no problem interval").toBe(null);
        const crash = getTrip("morning").problem;
        const middle = (crash.fromFraction + crash.toFraction) / 2;
        expect(glanceFacts("morning", "A", middle, true).minutesLeft, "partly passed crash delay shares remaining-cost helper")
            .toBe(Math.round(remainingStats("morning", "stopped", "A", middle).timeMin));

        const d = new TrafficInsightLeafDriver();
        await d.waitForLens();
        const main = TrafficInsightMain.getInstance();
        try {
            main.setHeadPitchOverrideForTests(0);
            await d.press(BUTTON_NAMES.whereAmI);
            expect(simulatorShowsCaption("Ask while riding."), "contextual response outside riding").toBe(true);
            await d.press(BUTTON_NAMES.goHome);
            await d.press(BUTTON_NAMES.routeDotA);
            await d.press(BUTTON_NAMES.whereAmI);
            expect(snap().lastCaption, "no premature hazard report").toBe(glanceFacts("evening", "A", 0, false).sentence);
            expect(visibleLensFlags(snap()).length, "voice answer adds no Lens visuals").toBe(0);
            await d.rideUntilAlert();
            await d.waitForState("Riding", 4000);
            await sleep(650);
            main.setHeadPitchOverrideForTests(25);
            await sleep(550);
            const before = snap();
            expect(before.visible.glanceStrip, "answer can interrupt an active glance").toBe(true);
            expect(before.glanceText, "known rain facts rendered").toBe(glanceFacts("evening", "A", before.progress, true).text);
            const interval = findSceneObjectByName("GlanceProblem");
            expect(interval.isEnabledInHierarchy, "known rain interval is actually drawn").toBe(true);
            expect(interval.getTransform().getLocalScale().x, "interval uses the same route fractions")
                .toBeCloseTo(18 * (rain.toFraction - rain.fromFraction), 3);
            await d.press(BUTTON_NAMES.whereAmI);
            const after = snap();
            const expected = glanceFacts("evening", "A", before.progress, true).sentence;
            expect(after.lastCaption, "voice and glance share facts").toBe(expected);
            expect(simulatorShowsCaption(expected), "actual caption text").toBe(true);
            expect(visibleLensFlags(after).length, "voice dismisses glance").toBe(0);
            expect(after.progress, "answer preserves progress").toBe(before.progress);
            expect(after.activeRoute, "answer preserves route").toBe(before.activeRoute);
            expect(after.state, "answer preserves Riding").toBe("Riding");
            await sleep(650);
            expect(snap().glance, "held-down pose cannot reopen after voice").toBe(false);
        } finally { main.setHeadPitchOverrideForTests(null); }
    }
}
