/**
 * ProgressMarksScenario.ts — LEAF scenario C8 (design brief, done criterion 8).
 *
 * When stopped, the part of the route already ridden is shown dim, with a clear
 * "you are here" marker (larger than the home and office markers, in a bright
 * accent colour) and a progress card such as "Ridden 9 of 34 min". Riding on
 * hides all of it.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, leafLog, snap, visibleLensFlags } from "./TrafficInsightLeafDriver";

function baseColorOf(name: string): vec4 {
    const obj = findSceneObjectByName(name);
    expect(!!obj, name + " found").toBe(true);
    const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    return rmv.mainMaterial.mainPass.baseColor;
}

function brightness(c: vec4): number {
    return (c.x + c.y + c.z) / 3;
}

@component
export class ProgressMarksScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();

        await driver.planMorningTrip();
        const homeMarker = findSceneObjectByName(ROOT_NAMES.homeMarker);
        const rider = findSceneObjectByName(ROOT_NAMES.riderMarker);
        expect(snap().visible.progressMarks, "no progress marks while planning").toBe(false);
        expect(rider.getTransform().getWorldScale().x, "rider marker is the normal size while planning").toBeCloseTo(
            homeMarker.getTransform().getWorldScale().x,
            3
        );

        await driver.press(BUTTON_NAMES.routeDotA);
        await driver.rideUntilAlert();
        await driver.waitForState("Riding", 4000);
        expect(snap().visible.progressMarks, "no progress marks while riding").toBe(false);
        await driver.press(BUTTON_NAMES.stopped);

        const s = snap();
        leafLog("progress card='" + s.progressCardText + "' progress=" + s.progress);
        expect(s.state, "state after I've stopped").toBe("Stopped");
        expect(s.visible.progressMarks, "dim ridden stretch and you-are-here marker visible").toBe(true);
        expect(s.visible.progressCard, "progress card visible").toBe(true);
        expect(s.progressCardText, "progress card text").toBe("Ridden 9 of 34 min");

        // The ridden stretch is drawn, and dimmer than the route lines still to ride.
        const ridden = findSceneObjectByName(ROOT_NAMES.riddenRoute);
        expect(!!ridden && ridden.isEnabledInHierarchy, "ridden stretch drawn").toBe(true);
        const riddenBrightness = brightness(baseColorOf(ROOT_NAMES.riddenRoute));
        const routeBrightness = brightness(baseColorOf("RouteARibbon"));
        leafLog("ridden brightness=" + riddenBrightness.toFixed(2) + " route A brightness=" + routeBrightness.toFixed(2));
        expect(riddenBrightness, "ridden stretch is dimmer than the route ahead").toBeLessThan(routeBrightness - 0.1);

        // The marker is clearly bigger than the home marker and in the bright accent colour.
        const markerScale = rider.getTransform().getWorldScale().x;
        const homeScale = homeMarker.getTransform().getWorldScale().x;
        expect(markerScale, "you-are-here marker is larger than the home marker").toBeGreaterThan(homeScale * 2);
        const c = baseColorOf(ROOT_NAMES.riderMarker);
        leafLog("marker colour=(" + c.x.toFixed(2) + ", " + c.y.toFixed(2) + ", " + c.z.toFixed(2) + ")");
        expect(c.x > 0.9 && c.y > 0.8 && c.z < 0.4, "marker is a bright yellow accent").toBe(true);

        // Riding on hides it all.
        await driver.press(BUTTON_NAMES.routeDotB);
        const after = snap();
        expect(after.state, "riding again").toBe("Riding");
        expect(visibleLensFlags(after).length, "Lens layer empty after riding on: " + visibleLensFlags(after).join(",")).toBe(0);
        expect(after.progressCardText, "progress card text cleared").toBe("");
        leafLog("C8 done");
    }
}
