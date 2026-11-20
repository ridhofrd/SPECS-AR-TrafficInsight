/**
 * MapPlacementScenario.ts — LEAF scenario C7 (design brief, done criterion 7).
 *
 * "I've stopped" puts the map about 1 m ahead and a little below eye level,
 * in view. Measured from the rider's eye position, looking straight ahead, so
 * it does not depend on how the Preview's camera happens to be turned.
 */

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import { ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { TrafficInsightLeafDriver, eyePosition, leafLog, snap, viewAngles } from "./TrafficInsightLeafDriver";

@component
export class MapPlacementScenario extends Scenario {
    async run(): Promise<void> {
        const driver = new TrafficInsightLeafDriver();
        await driver.waitForLens();
        await driver.stopAfterCrash();

        const mapRoot = findSceneObjectByName(ROOT_NAMES.mapRoot);
        expect(!!mapRoot, "MapRoot found").toBe(true);
        expect(snap().visible.map, "map visible while stopped").toBe(true);

        const mapAt = mapRoot.getTransform().getWorldPosition();
        const eye = eyePosition();
        const ahead = eye.z - mapAt.z;
        const below = eye.y - mapAt.y;
        const sideways = mapAt.x - eye.x;
        const angles = viewAngles(mapAt);
        leafLog(
            "map centre: " + ahead.toFixed(0) + " cm ahead, " + below.toFixed(1) + " cm below eye level, " +
                sideways.toFixed(1) + " cm to the side; " + angles.y.toFixed(1) + " degrees below the horizon, " +
                angles.x.toFixed(1) + " degrees to the side"
        );

        expect(ahead, "map is about 1 m ahead (at least 90 cm)").toBeGreaterThan(90);
        expect(ahead, "map is about 1 m ahead (at most 130 cm)").toBeLessThan(130);
        expect(below, "map is below eye level").toBeGreaterThan(5);
        expect(below, "map is only a little below eye level (at most 35 cm)").toBeLessThan(35);
        expect(Math.abs(sideways), "map is in front of the rider, not off to a side").toBeLessThan(10);
        // In view: the Spectacles display is about 20 degrees either way from the middle of the view.
        expect(angles.y < -3 && angles.y > -18, "map centre is a little below the middle of the view: " + angles.y).toBe(true);
        expect(Math.abs(angles.x), "map centre is in view horizontally").toBeLessThan(10);
        leafLog("C7 done");
    }
}
