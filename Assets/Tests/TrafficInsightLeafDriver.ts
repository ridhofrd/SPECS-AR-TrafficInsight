/**
 * TrafficInsightLeafDriver.ts
 *
 * Owns: the shared test helpers for the TrafficInsight LEAF scenarios (C1-C6):
 * a DefaultLeafInteractor subclass that presses buttons / pinches route dots by
 * their stable scene names, plus read-only helpers for the Lens snapshot
 * (TrafficInsightMain.getState()) and for Text shown on the Ride simulator.
 * Inputs: none. Not a component; scenarios create a driver inside run().
 * Must not: change Lens state except through the same Interactables a user
 * would pinch.
 *
 * Based on the LEAF package's "Custom Interactor Template" (DefaultLeafInteractor
 * + findInteractablesByName + trigger), adapted for this Lens.
 */

import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { DEFAULT_EVENT_TIMEOUT_MS, findSceneObjectByName, nextFrame, sleep, waitUntil } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { TrafficInsightMain } from "../Scripts/TrafficInsightMain";
import { BUTTON_NAMES, ROOT_NAMES } from "../Scripts/TrafficInsightSceneContracts";
import { LensVisibility, StateName, TrafficInsightSnapshot } from "../Scripts/TrafficInsightTypes";

/** Every Lens-layer flag (everything except the simulator's clarify dialog). */
export const LENS_FLAGS: (keyof LensVisibility)[] = [
    "table",
    "map",
    "routeA",
    "routeB",
    "dotA",
    "dotB",
    "labelA",
    "labelB",
    "problemHighlight",
    "problemCard",
    "raincoatReminder",
    "alertIcon",
];

const TAG = "[TrafficInsightLeaf]";

export function leafLog(message: string): void {
    console.log(TAG + " " + message);
}

/** The running Lens snapshot; throws if Main has not started. */
export function snap(): TrafficInsightSnapshot {
    const main = TrafficInsightMain.getInstance();
    if (!main) {
        throw new Error("TrafficInsightMain.getInstance() is null");
    }
    const s = main.getState();
    if (!s) {
        throw new Error("TrafficInsightMain.getState() returned null");
    }
    return s;
}

/** Names of Lens-layer flags that are currently true. */
export function visibleLensFlags(s: TrafficInsightSnapshot): string[] {
    return LENS_FLAGS.filter((k) => s.visible[k]);
}

/** Every Text string under a root SceneObject (depth-first). */
export function textsUnder(rootName: string): string[] {
    const root = findSceneObjectByName(rootName);
    const out: string[] = [];
    if (!root) {
        return out;
    }
    const walk = (o: SceneObject) => {
        const texts = o.getComponents("Component.Text") as Text[];
        for (const t of texts) {
            out.push(t.text);
        }
        for (let i = 0; i < o.getChildrenCount(); i++) {
            walk(o.getChild(i));
        }
    };
    walk(root);
    return out;
}

/** The Ride simulator's progress line, e.g. "Office trip: 5%". */
export function simulatorProgressText(): string {
    const re = /^(No trip|Office trip|Home trip): \d+%$/;
    const hit = textsUnder(ROOT_NAMES.rideSimulatorRoot).find((t) => re.test(t));
    return hit === undefined ? "" : hit;
}

/** True when some Text on the Ride simulator shows exactly this caption. */
export function simulatorShowsCaption(caption: string): boolean {
    return textsUnder(ROOT_NAMES.rideSimulatorRoot).some((t) => t === caption);
}

export class TrafficInsightLeafDriver extends DefaultLeafInteractor {
    constructor() {
        super("TrafficInsightLeafDriver");
        this.eventTimeoutMs = DEFAULT_EVENT_TIMEOUT_MS;
    }

    /** Waits for Main to start and the trip buttons to be pinchable. */
    async waitForLens(): Promise<void> {
        await waitUntil(
            () => {
                const main = TrafficInsightMain.getInstance();
                return !!main && !!main.getState() && !!findInteractableByName(BUTTON_NAMES.goToOffice, undefined, true);
            },
            8000,
            () => "TrafficInsight did not become ready"
        );
        await sleep(500);
        leafLog("lens ready state=" + snap().state);
    }

    /** Pinch the enabled Interactable on the SceneObject with this name. */
    async press(name: string, settleMs: number = 300): Promise<void> {
        await waitUntil(
            () => !!findInteractableByName(name, undefined, true),
            3000,
            () => "Interactable '" + name + "' not found or not enabled"
        );
        const target = findInteractableByName(name, undefined, true);
        leafLog("press " + name);
        await this.trigger(target);
        if (settleMs > 0) {
            await sleep(settleMs);
        } else {
            await nextFrame();
        }
    }

    /** Waits until the state machine reports this state. */
    async waitForState(state: StateName, timeoutMs: number): Promise<void> {
        await waitUntil(
            () => snap().state === state,
            timeoutMs,
            () => "expected state " + state + ", got " + snap().state
        );
    }

    /** GoToOffice -> MainOffice: morning trip map is up. */
    async planMorningTrip(): Promise<void> {
        await this.press(BUTTON_NAMES.goToOffice);
        await this.press(BUTTON_NAMES.mainOffice);
        expect(snap().planningStep, "planning step after Main office").toBe("map");
    }

    /** Ride presses until the crash/rain alert fires (2 presses at 0.05/step). */
    async rideUntilAlert(maxPresses: number = 6): Promise<number> {
        let presses = 0;
        while (snap().state === "Riding" && presses < maxPresses) {
            await this.press(BUTTON_NAMES.ride, 100);
            presses++;
        }
        expect(snap().state, "state after riding to the alert point").toBe("Alerted");
        return presses;
    }
}
