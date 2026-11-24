/** C15 exercises all four departure outcomes through the same Preview controls as the rider. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, snap, textsUnder } from "./TrafficInsightLeafDriver";

@component
export class DepartureInsightScenario extends Scenario {
    async run(): Promise<void> {
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
        await driver.press(BUTTON_NAMES.routeDotA);
        expect(snap().state, "rider can take the slower route immediately").toBe("Riding");
        expect(snap().visible.departureCard, "planning insight hidden on departure").toBe(false);
        await driver.press(BUTTON_NAMES.whereAmI);
        expect(snap().lastCaption.includes("56 minutes"), "riding estimate follows the chosen route").toBe(true);
    }
}
