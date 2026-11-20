/** C11: deliberate pitch reveals the actual compact, non-interactive route view. */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { glanceFacts } from "../Scripts/TrafficInsightTripData";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { cameraObject, snap, textsUnder, TrafficInsightLeafDriver, visibleLensFlags } from "./TrafficInsightLeafDriver";

@component
export class GlanceLookDownScenario extends Scenario {
    async run(): Promise<void> {
        const d = new TrafficInsightLeafDriver();
        await d.waitForLens();
        const main = TrafficInsightMain.getInstance();
        main.setHeadPitchOverrideForTests(0);
        try {
            await d.planMorningTrip();
            await d.press(BUTTON_NAMES.routeDotB);
            await sleep(650);
            main.setHeadPitchOverrideForTests(25);
            await sleep(100);
            expect(snap().visible.glanceStrip, "short look does not trigger").toBe(false);
            await sleep(450);
            let s = snap();
            expect(s.visible.glanceStrip && s.glance, "strip actually shown after dwell").toBe(true);
            expect(s.glanceSource, "hands-free trigger source").toBe("lookDown");
            expect(s.glanceOpacity, "fade reaches readable opacity").toBeGreaterThan(0.9);
            expect(visibleLensFlags(s).join(","), "only the compact strip is visible").toBe("glanceStrip");
            expect(s.glanceText, "shared facts rendered").toBe(glanceFacts("morning", "B", 0, false).text);
            const texts = textsUnder(ROOT_NAMES.glanceStripRoot);
            for (const word of ["Home", "Office", "you", s.glanceText]) expect(texts.indexOf(word) >= 0, "actual strip text: " + word).toBe(true);
            const root = findSceneObjectByName(ROOT_NAMES.glanceStripRoot);
            const delta = root.getTransform().getWorldPosition().sub(cameraObject().getTransform().getWorldPosition());
            expect(delta.length, "anchor distance from eye").toBeCloseTo(100, 1);
            const below = Math.atan2(-delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z)) * 180 / Math.PI;
            expect(below, "dashboard spot below horizon").toBeCloseTo(25, 1);
            const f = cameraObject().getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
            const right = new vec3(-f.z, 0, f.x).normalize();
            expect(Math.abs(delta.dot(right)), "centred on camera heading").toBeLessThan(2);
            const inspect = (node: SceneObject) => {
                expect(!!node.getComponent(Interactable.getTypeName()), "no glance hand targets").toBe(false);
                expect(!!node.getComponent("Physics.ColliderComponent"), "no glance colliders").toBe(false);
                for (let i=0;i<node.getChildrenCount();i++) inspect(node.getChild(i));
            };
            inspect(root);
            await d.press(BUTTON_NAMES.ride, 0);
            s = snap();
            expect(s.glanceText, "moving updates the displayed facts").toBe(glanceFacts("morning", "B", s.progress, false).text);
            const ridden = findSceneObjectByName("GlanceRidden").getTransform();
            expect(ridden.getLocalScale().x, "dim section matches travelled fraction").toBeCloseTo(18 * s.progress, 3);
            const rider = findSceneObjectByName("GlanceRider").getTransform();
            expect(rider.getLocalPosition().x, "yellow marker sits at the same progress").toBeCloseTo(18 * (s.progress - 0.5), 3);
            expect(findSceneObjectByName("GlanceProblem").isEnabledInHierarchy, "unknown hazard is not drawn").toBe(false);
            main.setHeadPitchOverrideForTests(0);
            await sleep(400);
            expect(snap().visible.glanceStrip, "look up hides the strip").toBe(false);
        } finally { main.setHeadPitchOverrideForTests(null); }
    }
}
