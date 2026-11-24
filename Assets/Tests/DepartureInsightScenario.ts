/** C15 exercises all four departure outcomes through the same Preview controls as the rider. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { departureFor, TrafficHistory } from "../Scripts/TrafficInsightDeparture";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, snap, textsUnder } from "./TrafficInsightLeafDriver";

@component
export class DepartureInsightScenario extends Scenario {
    async run(): Promise<void> {
        const profile: TrafficHistory = {
            version: 1, source: "collected", corridor: "bcn-via-julia-dfactory-v1", validUntil: 600,
            frames: {
                480: {date: "2026-11-24", day: "Tue", minute: 480},
                495: {date: "2026-11-24", day: "Tue", minute: 495, morning: {A: 30, B: 50, days: 3}},
            },
            live: {morning: {slot: 480, A: 60, B: 48}},
        };
        const recent = departureFor(profile, "morning", 485);
        expect(recent.minutes.B, "recent times work before history is available for this slot").toBe(48);
        expect(recent.context.includes("Recent traffic"), "fresh observations are labeled").toBe(true);
        expect(recent.later.includes("typical"), "the later option uses historical times").toBe(true);
        const stale = departureFor(profile, "morning", 501);
        expect(stale.minutes.A, "stale live times fall back to weekday medians").toBe(30);
        expect(stale.context.includes("live unavailable"), "stale observations are disclosed").toBe(true);
        expect(departureFor(profile, "evening", 485).minutes, "live morning routes do not affect the return trip").toBe(null);

        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();
        await driver.press(BUTTON_NAMES.goToOffice);
        await driver.press(BUTTON_NAMES.mainOffice);
        const check = (status: string, route: string, expectedText: string) => {
            const s = snap();
            expect(s.visible.departureCard, "departure card visible while planning").toBe(true);
            expect(s.departure.status, "departure outcome").toBe(status);
            expect(s.recommendedRoute, "fastest route now").toBe(route);
            expect(textsUnder("DepartureCard").some(line => line.includes(expectedText)), "rendered " + expectedText).toBe(true);
        };
        check("good", "A", "Good time to go");
        await driver.press(BUTTON_NAMES.sampleTime);
        check("busy", "B", "B saves 13 min");
        expect(snap().labelTextB.includes("43 min total"), "route B card uses the same time").toBe(true);
        expect(textsUnder("DepartureCard").some(line => line.includes("arrive 09:04")), "waiting changes arrival").toBe(true);
        await driver.press(BUTTON_NAMES.sampleTime);
        check("busy", "A", "A is still your quickest route");
        await driver.press(BUTTON_NAMES.sampleTime);
        check("unknown", "A", "Still learning");
        await driver.press(BUTTON_NAMES.sampleTime);
        await driver.press(BUTTON_NAMES.sampleTime);
        await driver.press(BUTTON_NAMES.departureWeekdayPrefix + "Tue");
        expect(textsUnder("DepartureCard").some(line => line.includes("Lighter window · 07:30")), "Tuesday lighter window").toBe(true);
        await driver.press(BUTTON_NAMES.departureWeekdayPrefix + "Sat");
        expect(textsUnder("DepartureCard").some(line => line.includes("Lighter window · 08:30")), "Saturday has its own window").toBe(true);
        expect(snap().recommendedRoute, "weekday does not change leaving-now advice").toBe("B");
        await driver.press(BUTTON_NAMES.departureNow);
        check("busy", "B", "B saves 13 min");
        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, "rider can take the slower route immediately").toBe("Riding");
        expect(snap().visible.departureCard, "planning insight hidden on departure").toBe(false);
        await driver.press(BUTTON_NAMES.whereAmI);
        expect(snap().lastCaption.includes("56 minutes"), "riding estimate follows the chosen route").toBe(true);
    }
}
