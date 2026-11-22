/**
 * TrafficInsightRoadView.ts
 *
 * Owns: the mock street on the floor ahead and everything drawn on it while the
 * rider is stopped: the street (muted grey, one junction where route B turns
 * off), a wide vivid stripe for route A and one for route B, and a pulsing ring
 * where the routes split. The stripes can be aimed at (they brighten) and
 * pinched (they pick that route), the same as the route dots on the map.
 * Stand-in only: the real product would draw the route on the real road from
 * the rider's location and heading; the Preview has no road, so this street
 * is a model of one.
 * Lives on: RoadViewRoot (never disabled; the visuals hang under a child group).
 * Inputs: lineMaterial (cloned per colour), floor height, how far ahead the
 * street starts, street size, stripe width.
 * Produces: onLinePicked, onLineHover, applyView(view), setExternalHover(route),
 * setInputEnabled(), getVisibility(), getHighlight(), getChosen().
 * Must not: decide when it is shown (Main sends a RoadViewState), hold trip
 * state, or touch other scripts.
 */

import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event, { PublicApi } from "InteractionKit.lspkg/Utils/Event";
import { GeoBuffer, addRect, addRibbon, addRing, newMeshBuilder } from "./TrafficInsightGeometry";
import { MapPoint, RoadViewState, RouteId, RouteOrNone } from "./TrafficInsightTypes";
import { BUTTON_NAMES, ROOT_NAMES, tiError, tiLog } from "./TrafficInsightSceneContracts";

/** Muted street, so the vivid stripes stand out (the display is additive: no near-black). */
const STREET_COLOR = new vec4(0.4, 0.43, 0.48, 1);
const ROUTE_A_COLOR = new vec4(0.15, 0.72, 1, 1);
const ROUTE_B_COLOR = new vec4(0.2, 1, 0.45, 1);
// Yellow means the rider's position only. The junction has a neutral white ring.
const RING_COLOR = new vec4(0.95, 0.97, 1, 1);
const HOVER_WHITE_MIX = 0.4;
const CHOSEN_WHITE_MIX = 0.4;
const FADE_TO_STREET_MIX = 0.88;

const STRIPE_Y = 0.3;
const RING_Y = 0.6;
const COLLIDER_HEIGHT_CM = 20;
/** Colliders are this many times wider than the stripe, so a long thin line is easier to aim at. */
const COLLIDER_WIDTH_FACTOR = 2;
/** Where the junction sits along the street, as a fraction of its length. */
const JUNCTION_AT = 0.55;
const SIDE_ROAD_LENGTH_CM = 250;
const LANE_OFFSET_CM = 55;
const RING_SEGMENTS = 48;
const RING_INNER_CM = 70;
const RING_OUTER_CM = 100;
const PULSE_HZ = 0.75;
const PULSE_AMPLITUDE = 0.12;

interface VisualPart {
    obj: SceneObject;
    rmv: RenderMeshVisual;
    mb: MeshBuilder;
    mat: Material;
}

interface Hit {
    route: RouteId;
    obj: SceneObject;
    collider: ColliderComponent;
    interactable: Interactable;
    hovered: boolean;
}

function mix(a: vec4, b: vec4, k: number): vec4 {
    return new vec4(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.w);
}

@component
export class TrafficInsightRoadView extends BaseScriptComponent {
    @input lineMaterial: Material;
    @input @widget(new SliderWidget(-260, -60, 5)) floorYCm: number = -160;
    @input @widget(new SliderWidget(200, 2000, 10)) nearDistanceCm: number = 1050;
    @input @widget(new SliderWidget(200, 500, 10)) streetWidthCm: number = 220;
    @input @widget(new SliderWidget(500, 1500, 10)) streetLengthCm: number = 800;
    @input @widget(new SliderWidget(20, 80, 2)) stripeWidthCm: number = 50;

    private readonly linePickedEvent = new Event<{ route: RouteId }>();
    private readonly lineHoverEvent = new Event<{ route: RouteId; on: boolean }>();

    private ready = false;
    private started = false;
    private inputEnabled = true;
    private view: RoadViewState = { shown: false, targetable: false, chosen: "none" };
    private externalHover: RouteOrNone = "none";

    private group: SceneObject;
    private street: VisualPart;
    private stripeA: VisualPart;
    private stripeB: VisualPart;
    private ring: VisualPart;
    private ringCentre: MapPoint = { x: 0, z: 0 };
    /** Corners (road-local, y = 0) of the main road and the side road, for the "does not cover the map" test. */
    private footprints: MapPoint[][] = [];
    private hits: Hit[] = [];

    get onLinePicked(): PublicApi<{ route: RouteId }> {
        return this.linePickedEvent.publicApi();
    }

    get onLineHover(): PublicApi<{ route: RouteId; on: boolean }> {
        return this.lineHoverEvent.publicApi();
    }

    onAwake(): void {
        if (!this.lineMaterial) {
            tiError("RoadView: missing @input lineMaterial; road view disabled");
            return;
        }
        this.sceneObject.getTransform().setWorldPosition(new vec3(0, this.floorYCm, 0));
        this.build();
        this.ready = true;
        this.applyState();
        this.createEvent("OnStartEvent").bind(() => this.onStart());
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private onStart(): void {
        for (const hit of this.hits) {
            hit.interactable.onTriggerEnd.add(() => {
                if (!this.pickable()) return;
                tiLog("road line picked route=" + hit.route);
                this.linePickedEvent.invoke({ route: hit.route });
            });
            hit.interactable.onHoverEnter.add(() => {
                if (!this.pickable()) return;
                hit.hovered = true;
                this.lineHoverEvent.invoke({ route: hit.route, on: true });
                this.applyColours();
            });
            hit.interactable.onHoverExit.add(() => {
                if (!hit.hovered) return;
                hit.hovered = false;
                this.lineHoverEvent.invoke({ route: hit.route, on: false });
                this.applyColours();
            });
        }
        this.started = true;
        tiLog("RoadView ready");
    }

    // ---- API (Main drives all of it) ----

    applyView(view: RoadViewState): void {
        if (!this.ready) return;
        this.view = view;
        this.applyState();
    }

    /** The route dots and the "Choose route" buttons brighten the matching stripe too. */
    setExternalHover(route: RouteOrNone): void {
        if (!this.ready || this.externalHover === route) return;
        this.externalHover = route;
        this.applyColours();
    }

    setInputEnabled(enabled: boolean): void {
        this.inputEnabled = enabled;
        if (this.ready) this.applyState();
    }

    getVisibility(): { road: boolean; roadLineA: boolean; roadLineB: boolean; splitRing: boolean } {
        if (!this.ready) return { road: false, roadLineA: false, roadLineB: false, splitRing: false };
        const on = this.view.shown;
        return {
            road: on && this.group.enabled && this.street.obj.enabled,
            roadLineA: on && this.group.enabled && this.stripeA.obj.enabled,
            roadLineB: on && this.group.enabled && this.stripeB.obj.enabled,
            splitRing: on && this.group.enabled && this.ring.obj.enabled,
        };
    }

    /** World-space corners of the main road and the side road (two quads), for layout checks. */
    getFootprints(): vec3[][] {
        if (!this.ready) return [];
        const toWorld = this.group.getTransform().getWorldTransform();
        return this.footprints.map((quad) => quad.map((p) => toWorld.multiplyPoint(new vec3(p.x, 0, p.z))));
    }

    /** The stripe currently brightened by aiming (line, dot or button), or 'none'. */
    getHighlight(): RouteOrNone {
        return this.hoverRoute();
    }

    getChosen(): RouteOrNone {
        return this.view.chosen;
    }

    // ---- building (onAwake, own content only) ----

    private build(): void {
        const w = this.streetWidthCm;
        const near = this.nearDistanceCm;
        const far = near + this.streetLengthCm;
        const zJunction = -(near + this.streetLengthCm * JUNCTION_AT);
        const half = w * 0.5;

        this.group = global.scene.createSceneObject("RoadVisuals");
        this.group.setParent(this.sceneObject);

        // Street: the main road and the side road route B turns onto.
        const streetGeo = new GeoBuffer();
        addRect(streetGeo, -half, -near, half, -far);
        addRect(streetGeo, half, zJunction + half, half + SIDE_ROAD_LENGTH_CM, zJunction - half);
        if (global.deviceInfoSystem.isEditor()) {
            // Match the surrounding asphalt's 2 m tiles, including the branch.
            for (let i = 0; i < streetGeo.data.length; i += 8) {
                streetGeo.data[i + 6] = streetGeo.data[i] / 200;
                streetGeo.data[i + 7] = -streetGeo.data[i + 2] / 200;
            }
        }
        this.footprints = [
            [{ x: -half, z: -near }, { x: half, z: -near }, { x: half, z: -far }, { x: -half, z: -far }],
            [
                { x: half, z: zJunction + half },
                { x: half + SIDE_ROAD_LENGTH_CM, z: zJunction + half },
                { x: half + SIDE_ROAD_LENGTH_CM, z: zJunction - half },
                { x: half, z: zJunction - half },
            ],
        ];
        this.street = this.makePart(ROOT_NAMES.roadStreet, STREET_COLOR, 0);
        this.fillPart(this.street, streetGeo);

        // Route A runs straight on; route B turns right at the junction.
        const ptsA: MapPoint[] = [{ x: -LANE_OFFSET_CM, z: -near }, { x: -LANE_OFFSET_CM, z: -far }];
        const bTurnZ = zJunction + LANE_OFFSET_CM;
        const bEndX = half + SIDE_ROAD_LENGTH_CM;
        const ptsB: MapPoint[] = [
            { x: LANE_OFFSET_CM, z: -near },
            { x: LANE_OFFSET_CM, z: bTurnZ },
            { x: bEndX, z: bTurnZ },
        ];
        this.stripeA = this.makePart("RoadLineAStripe", ROUTE_A_COLOR, STRIPE_Y);
        this.fillPart(this.stripeA, this.ribbonGeo(ptsA));
        this.stripeB = this.makePart("RoadLineBStripe", ROUTE_B_COLOR, STRIPE_Y);
        this.fillPart(this.stripeB, this.ribbonGeo(ptsB));

        // Pulsing ring where the routes split.
        this.ringCentre = { x: 0, z: zJunction + LANE_OFFSET_CM * 0.5 };
        const ringGeo = new GeoBuffer();
        addRing(ringGeo, RING_INNER_CM, RING_OUTER_CM, RING_SEGMENTS);
        this.ring = this.makePart(ROOT_NAMES.roadSplitRing, RING_COLOR, RING_Y);
        this.fillPart(this.ring, ringGeo);
        this.ring.obj.getTransform().setLocalPosition(new vec3(this.ringCentre.x, RING_Y, this.ringCentre.z));

        // Targets: one box per straight part of a stripe, wider than the stripe.
        const cw = this.stripeWidthCm * COLLIDER_WIDTH_FACTOR;
        this.makeHit(BUTTON_NAMES.roadLineA, "A", ptsA[0], ptsA[1], cw);
        this.makeHit(BUTTON_NAMES.roadLineB, "B", ptsB[0], ptsB[1], cw);
        this.makeHit(BUTTON_NAMES.roadLineBSide, "B", ptsB[1], ptsB[2], cw);
    }

    private ribbonGeo(points: MapPoint[]): GeoBuffer {
        const g = new GeoBuffer();
        addRibbon(g, points, this.stripeWidthCm);
        return g;
    }

    private makePart(name: string, color: vec4, y: number): VisualPart {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.group);
        obj.getTransform().setLocalPosition(new vec3(0, y, 0));
        const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const previewStreet = name === ROOT_NAMES.roadStreet && global.deviceInfoSystem.isEditor();
        const mat = previewStreet ? (requireAsset("../Materials/PreviewRoadSurface.mat") as Material).clone() : this.lineMaterial.clone();
        mat.mainPass.baseColor = previewStreet ? new vec4(0.92,0.94,0.97,1) : color;
        if (previewStreet) {
            mat.mainPass.samplers.baseTex.wrap = WrapMode.Repeat;
            mat.mainPass.samplers.baseTex.filtering = FilteringMode.Trilinear;
        }
        rmv.mainMaterial = mat;
        return { obj: obj, rmv: rmv, mb: newMeshBuilder(), mat: mat };
    }

    private fillPart(part: VisualPart, g: GeoBuffer): void {
        if (g.writeTo(part.mb)) {
            part.rmv.mesh = part.mb.getMesh();
        } else {
            tiError("RoadView: could not build mesh for " + part.obj.name);
        }
    }

    /** A box collider + Interactable along a straight part of a stripe (road-local x right, z ahead = negative). */
    private makeHit(name: string, route: RouteId, from: MapPoint, to: MapPoint, width: number): void {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.group);
        const midX = (from.x + to.x) * 0.5;
        const midZ = (from.z + to.z) * 0.5;
        obj.getTransform().setLocalPosition(new vec3(midX, COLLIDER_HEIGHT_CM * 0.5, midZ));
        const lenX = Math.abs(to.x - from.x);
        const lenZ = Math.abs(to.z - from.z);
        // A stripe part runs along x or along z; the other extent is the collider width.
        const sizeX = lenX > lenZ ? lenX : width;
        const sizeZ = lenX > lenZ ? width : lenZ;

        const collider = obj.createComponent("Physics.ColliderComponent") as ColliderComponent;
        const shape = Shape.createBoxShape();
        shape.size = new vec3(sizeX, COLLIDER_HEIGHT_CM, sizeZ);
        collider.shape = shape;
        collider.fitVisual = false;

        const interactable = obj.createComponent(Interactable.getTypeName()) as Interactable;
        this.hits.push({ route: route, obj: obj, collider: collider, interactable: interactable, hovered: false });
    }

    // ---- view ----

    private pickable(): boolean {
        return this.started && this.view.shown && this.view.targetable && this.inputEnabled;
    }

    private hoverRoute(): RouteOrNone {
        for (const hit of this.hits) {
            if (hit.hovered) return hit.route;
        }
        return this.pickable() ? this.externalHover : "none";
    }

    private applyState(): void {
        const on = this.view.shown;
        this.group.enabled = on;
        this.street.obj.enabled = on;
        this.stripeA.obj.enabled = on;
        this.stripeB.obj.enabled = on;
        this.ring.obj.enabled = on;
        const pickable = this.view.shown && this.view.targetable && this.inputEnabled;
        for (const hit of this.hits) {
            if (!pickable) hit.hovered = false;
            hit.collider.enabled = pickable;
            hit.interactable.enabled = pickable;
        }
        this.applyColours();
    }

    /** Stripe colour = vivid base, brightened when aimed at or chosen, faded when the other is chosen. */
    private applyColours(): void {
        const hover = this.hoverRoute();
        const chosen = this.view.chosen;
        this.paint(this.stripeA, ROUTE_A_COLOR, "A", hover, chosen);
        this.paint(this.stripeB, ROUTE_B_COLOR, "B", hover, chosen);
    }

    private paint(part: VisualPart, base: vec4, route: RouteId, hover: RouteOrNone, chosen: RouteOrNone): void {
        let c = base;
        if (chosen !== "none") {
            c = chosen === route ? mix(base, new vec4(1, 1, 1, 1), CHOSEN_WHITE_MIX) : mix(base, STREET_COLOR, FADE_TO_STREET_MIX);
        } else if (hover === route) {
            c = mix(base, new vec4(1, 1, 1, 1), HOVER_WHITE_MIX);
        }
        part.mat.mainPass.baseColor = c;
    }

    private onUpdate(): void {
        if (!this.ready || !this.view.shown) return;
        const s = 1 + PULSE_AMPLITUDE * Math.sin(getTime() * Math.PI * 2 * PULSE_HZ);
        this.ring.obj.getTransform().setLocalScale(new vec3(s, 1, s));
        // The ring is centred on its own object, so scaling pulses it in place.
    }
}
