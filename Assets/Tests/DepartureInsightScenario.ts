/** C15 exercises all four departure outcomes through the same Preview controls as the rider. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { departureFor, TrafficHistory, weekdayTraffic } from "../Scripts/TrafficInsightDeparture";
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
            week: {
                "morning/Tue/480": {A: 34, B: 36, days: 3},
                "morning/Tue/495": {A: 30, B: 50, days: 2},
                "morning/Tue/510": {A: 45, B: 35, days: 3},
                "morning/Sat/540": {A: 20, B: 24, days: 3},
            },
        };
        const recent = departureFor(profile, "morning", 485);
        expect(recent.minutes.B, "recent times work before history is available for this slot").toBe(48);
        expect(recent.context.includes("Recent traffic"), "fresh observations are labeled").toBe(true);
        expect(recent.later.includes("typical"), "the later option uses historical times").toBe(true);
        const stale = departureFor(profile, "morning", 501);
        expect(stale.minutes.A, "stale live times fall back to weekday medians").toBe(30);
        expect(stale.context.includes("live unavailable"), "stale observations are disclosed").toBe(true);
        expect(departureFor(profile, "evening", 485).minutes, "live morning routes do not affect the return trip").toBe(null);

        const tuesday = weekdayTraffic(profile, "morning", 1, 485);
        const saturday = weekdayTraffic(profile, "morning", 5, 485);
        expect(tuesday.slots.map(slot => slot.minute).join(","), "sparse intervals stay missing").toBe("480,510");
        expect(tuesday.timeTicks.join(","), "weekdays share the time scale").toBe(saturday.timeTicks.join(","));
        expect(tuesday.minuteTicks.join(","), "weekdays share the duration scale").toBe(saturday.minuteTicks.join(","));
        expect(weekdayTraffic(profile, "evening", 1, 485).slots.length, "history stays direction-specific").toBe(0);
        expect(weekdayTraffic(profile, "morning", 1, 600).slots.length, "expired history has no points").toBe(0);

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
        expect(textsUnder("WeekdayTrafficChart").includes("Tue · Typical travel time"), "Tuesday chart title").toBe(true);
        const line = findSceneObjectByName("WeekdayRouteA");
        const mesh = (line.getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mesh;
        expect(line.isEnabledInHierarchy, "route A is drawn").toBe(true);
        expect(findSceneObjectByName("WeekdayRouteB").isEnabledInHierarchy, "route B is drawn").toBe(true);
        const tuesdayStart = mesh.extractVerticesForAttribute("position")[0];
        await driver.press(BUTTON_NAMES.departureWeekdayPrefix + "Sat");
        expect(textsUnder("WeekdayTrafficChart").includes("Sat · Typical travel time"), "Saturday chart title").toBe(true);
        expect(mesh.extractVerticesForAttribute("position")[0] > tuesdayStart, "Saturday data starts later on the same axis").toBe(true);
        expect(snap().recommendedRoute, "weekday does not change leaving-now advice").toBe("B");
        await driver.press(BUTTON_NAMES.departureNow);
        expect(line.isEnabledInHierarchy, "weekday graph is hidden in Now").toBe(false);
        check("busy", "B", "B saves 13 min");
        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, "rider can take the slower route immediately").toBe("Riding");
        expect(snap().visible.departureCard, "planning insight hidden on departure").toBe(false);
        await driver.press(BUTTON_NAMES.whereAmI);
        expect(snap().lastCaption.includes("56 minutes"), "riding estimate follows the chosen route").toBe(true);
    }
}
