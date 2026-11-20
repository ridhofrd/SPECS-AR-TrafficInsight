/** C10: surroundings follow both journeys without changing Lens visibility. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { BUTTON_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { PreviewPlace } from "../Scripts/TrafficInsightTypes";
import { TrafficInsightLeafDriver, leafLog, snap, visibleLensFlags } from "./TrafficInsightLeafDriver";

@component
export class JourneyContextScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();
        this.check("home", "day");
        const scenery = findSceneObjectByName("PreviewContextRoot");
        const inspect = (node: SceneObject) => {
            expect(!!node.getComponent(Interactable.getTypeName()), "scenery never steals hand input: " + node.name).toBe(false);
            expect(!!node.getComponent("Physics.ColliderComponent"), "scenery has no interaction colliders: " + node.name).toBe(false);
            for(let i=0;i<node.getChildrenCount();i++) inspect(node.getChild(i));
        };
        inspect(scenery);
        await driver.press(BUTTON_NAMES.goToOffice);
        this.check("home", "day");
        expect(snap().planningStep, "clarifying at home").toBe("clarify");
        await driver.press(BUTTON_NAMES.mainOffice);
        this.check("home", "day");
        await driver.press(BUTTON_NAMES.routeDotA);
        this.check("street", "day");
        expect(snap().progress, "entering the street preserves the starting progress").toBe(0);
        this.emptyRidingLens();
        await driver.rideUntilAlert();
        this.check("street", "day");
        expect(snap().previewContext.crashAhead, "the known crash has physical context ahead").toBe(true);
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);
        this.check("street", "day");
        const before = snap().progress;
        await driver.press(BUTTON_NAMES.routeDotB);
        this.check("street", "day");
        await driver.waitForRidingAfterPick();
        expect(snap().progress, "no scene reset on reroute").toBeCloseTo(before, 4);
        expect(snap().previewContext.crashAhead, "crash is not on the new corridor").toBe(false);
        await this.finish(driver);
        this.check("office", "day");
        expect(snap().progress, "office arrival keeps completed progress").toBe(1);

        await driver.press(BUTTON_NAMES.goHome);
        this.check("office", "evening");
        await driver.press(BUTTON_NAMES.routeDotA);
        this.check("street", "evening");
        expect(snap().previewContext.weather, "no prematurely disclosed rain before the alert").toBe("clear");
        await driver.rideUntilAlert();
        this.check("street", "evening");
        expect(snap().previewContext.weather, "rain is ahead, not over the rider yet").toBe("rainAhead");
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);
        this.check("street", "evening");
        await driver.press(BUTTON_NAMES.routeDotA);
        this.check("street", "evening");
        expect(snap().raincoatPrompt, "preparation keeps the rider on the same street").toBe(true);
        await driver.press(BUTTON_NAMES.raincoatOn);
        let sawRainHere = false;
        for (let i=0; snap().state === "Riding" && i<25; i++) {
            this.emptyRidingLens();
            await driver.press(BUTTON_NAMES.ride, 0);
            if (snap().previewContext.weather === "rainHere") sawRainHere = true;
        }
        expect(sawRainHere, "entering the sample rain interval changes the surroundings").toBe(true);
        expect(snap().state, "return trip arrived").toBe("Arrived");
        this.check("home", "evening");
        expect(snap().previewContext.weather, "arrival clears road weather context").toBe("clear");

        // A new evening trip takes the dry option after the warning.
        await driver.press(BUTTON_NAMES.goHome);
        await driver.press(BUTTON_NAMES.routeDotA);
        await driver.rideUntilAlert();
        await driver.waitForState("Riding", 4000);
        await driver.press(BUTTON_NAMES.stopped);
        await driver.press(BUTTON_NAMES.routeDotB);
        await driver.waitForRidingAfterPick();
        expect(snap().previewContext.weather, "dry reroute clears the simulated rain corridor").toBe("clear");
        this.check("street", "evening");
        this.emptyRidingLens();
        leafLog("C10 done: home/street/office, both directions and weather boundaries");
    }

    private check(place: PreviewPlace, light: "day" | "evening"): void {
        const c = snap().previewContext;
        expect(!!c && c.enabled, "editor scenery is enabled").toBe(true);
        expect(c.place, "context matches the journey stage").toBe(place);
        expect(c.light, "lighting matches the trip").toBe(light);
        expect(Object.keys(c.visible).filter((key) => c.visible[key]).length, "one place is visible").toBe(1);
        for (const name of ["home", "street", "office"]) {
            const root = findSceneObjectByName("Preview" + name[0].toUpperCase() + name.slice(1));
            expect(!!root && root.isEnabledInHierarchy, "actual " + name + " scenery visibility").toBe(name === place);
        }
    }

    private emptyRidingLens(): void {
        expect(visibleLensFlags(snap()).length, "world scenery does not add a riding HUD").toBe(0);
    }

    private async finish(driver: TrafficInsightLeafDriver): Promise<void> {
        for(let i=0; snap().state === "Riding" && i<25; i++) {
            this.emptyRidingLens();
            await driver.press(BUTTON_NAMES.ride, 0);
        }
        expect(snap().state, "trip finishes without a background reset").toBe("Arrived");
    }
}
