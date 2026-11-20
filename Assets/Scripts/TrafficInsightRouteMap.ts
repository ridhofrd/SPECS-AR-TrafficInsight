/**
 * TrafficInsightRouteMap.ts
 *
 * Owns: everything drawn on the city map — the route A / B ribbons, the
 * problem-stretch glow, the dim "already ridden" stretch, the rider marker
 * (a larger bright "you are here" marker while stopped), the home / office end
 * markers and the two pickable route dots (IK Interactable + sphere collider).
 * Lives on: MapRoot (the map's top-surface centre; map-local x right, z toward
 * the user, y up). MapRoot, RouteDotA and RouteDotB are never disabled.
 * Inputs: cityMap, dotA, dotB, lineMaterial (cloned once per colour), line
 * width, route / highlight colours, dot hover scale.
 * Produces: onDotPicked, onDotHover, applyView(view), getVisibility(),
 * setInputEnabled().
 * Must not: hold trip state (Main sends a MapView) or touch other scripts.
 * Size reason: one view over one map: ribbons, markers and dots share the same
 * materials and the same applyView pass; the mesh helpers are in
 * TrafficInsightGeometry.ts.
 */

import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event, { PublicApi } from "InteractionKit.lspkg/Utils/Event";
import { MapPoint, MapView, ProblemSpan, RouteId, TripId } from "./TrafficInsightTypes";
import { MAP_POINTS, pointAt, routePoints, sharedApproachFraction, slicePolyline } from "./TrafficInsightTripData";
import { ROOT_NAMES, tiError, tiLog } from "./TrafficInsightSceneContracts";
import { GeoBuffer, addPuck, addRibbon, newMeshBuilder } from "./TrafficInsightGeometry";
import { dynamicText, makeCardRect, obj } from "./UIKitHelpers";

const ROUTE_LINES_Y = 0.3;
const GLOW_WIDTH_CM = 1.6;
const GLOW_Y = -0.1;
const DOT_LOCAL_Y = 0.6; // authored height of RouteDotA/B above the map surface
const DOT_RADIUS_CM = 2;
const DOT_HEIGHT_CM = 1;
const DOT_COLLIDER_RADIUS_CM = 3;
const RIDER_RADIUS_CM = 1;
const RIDER_HEIGHT_CM = 0.5;
const END_RADIUS_CM = 0.75;
const END_HEIGHT_CM = 0.4;
const PUCK_SEGMENTS = 24;
const HOVER_WHITE_MIX = 0.35;
const RIDDEN_Y = 0.05;
/** The "you are here" marker is this many times the size of the normal rider marker. */
const YOU_ARE_HERE_SCALE = 2.6;
/** Dim, desaturated grey-blue: readable on the additive display but clearly "done". */
const RIDDEN_COLOR = new vec4(0.32, 0.4, 0.5, 1);
/** Bright accent that no route or problem colour uses. */
const YOU_ARE_HERE_COLOR = new vec4(1.0, 0.93, 0.2, 1);


interface RibbonPart {
    obj: SceneObject;
    rmv: RenderMeshVisual;
    mb: MeshBuilder;
    shown: boolean;
}

interface DotPart {
    root: SceneObject;
    visual: SceneObject;
    material: Material;
    baseColor: vec4;
    collider: ColliderComponent;
    interactable: Interactable;
    shown: boolean;
    hovered: boolean;
}

@component
export class TrafficInsightRouteMap extends BaseScriptComponent {
    @input cityMap: SceneObject;
    @input dotA: SceneObject;
    @input dotB: SceneObject;
    @input lineMaterial: Material;
    @input @widget(new SliderWidget(0.2, 2, 0.1)) routeLineWidthCm: number = 0.6;
    @input @widget(new ColorWidget()) routeAColor: vec4 = new vec4(0.15, 0.72, 1, 1);
    @input @widget(new ColorWidget()) routeBColor: vec4 = new vec4(0.2, 1, 0.45, 1);
    @input @widget(new ColorWidget()) crashHighlightColor: vec4 = new vec4(1.0, 0.620, 0.541, 1);
    @input @widget(new ColorWidget()) rainHighlightColor: vec4 = new vec4(1.0, 0.769, 0.420, 1);
    @input @widget(new SliderWidget(1, 2, 0.05)) dotHoverScale: number = 1.25;

    private readonly dotPickedEvent = new Event<{ route: RouteId }>();
    private readonly dotHoverEvent = new Event<{ route: RouteId; on: boolean }>();
    private ready = false;
    private inputEnabled = true;
    private mapShown = false;
    private lastKey = "";

    private routeLines: SceneObject;
    private ribbonA: RibbonPart;
    private ribbonB: RibbonPart;
    private approach: RibbonPart;
    private destinationLeg: RibbonPart;
    private glow: RibbonPart;
    private ridden: RibbonPart;
    private riderRmv: RenderMeshVisual;
    private riderMat: Material;
    private youAreHereMat: Material;
    private youAreHere = false;
    private crashMat: Material;
    private rainMat: Material;
    private rider: SceneObject;
    private endMarkers: SceneObject[] = [];
    private homeLabel: Text;
    private officeLabel: Text;
    private dots: { A: DotPart; B: DotPart };

    get onDotPicked(): PublicApi<{ route: RouteId }> {
        return this.dotPickedEvent.publicApi();
    }

    get onDotHover(): PublicApi<{ route: RouteId; on: boolean }> {
        return this.dotHoverEvent.publicApi();
    }

    onAwake(): void {
        if (!this.cityMap || !this.dotA || !this.dotB || !this.lineMaterial) {
            tiError("RouteMap: missing @input (cityMap, dotA, dotB or lineMaterial); map disabled");
            return;
        }
        this.buildRouteLines();
        this.dots = {
            A: this.buildDot(this.dotA, "A", this.routeAColor),
            B: this.buildDot(this.dotB, "B", this.routeBColor),
        };
        this.ready = true;
        this.applyHidden();
        this.createEvent("OnStartEvent").bind(() => this.onStart());
    }

    private onStart(): void {
        this.bindDot("A");
        this.bindDot("B");
        tiLog("RouteMap ready");
    }

    applyView(view: MapView): void {
        if (!this.ready) return;
        if (!view || view.mode === "hidden" || view.trip === "none") {
            this.applyHidden();
            return;
        }
        const trip = view.trip as TripId;
        const progress = Math.round(Math.max(0, Math.min(1, view.progress)) * 1000) / 1000;
        const problem: ProblemSpan | null = view.mode === "planning" ? null : view.problem;
        const key = [view.mode, trip, view.activeRoute, progress, problem ? problem.route + problem.kind + problem.fromFraction + "-" + problem.toFraction : "-"].join("|");

        this.setMapShown(true);
        this.routeLines.enabled = true;
        const ptsA = routePoints(trip, "A");
        const ptsB = routePoints(trip, "B");
        this.homeLabel.text = trip === "morning" ? "Home · Start" : "Home · Destination";
        this.officeLabel.text = trip === "morning" ? "Office · Destination" : "Office · Start";
        // The demo overview is heading-up, like the road choices: start near
        // the rider, destination ahead. It does not pretend to be north-up GPS.
        const homeZ = trip === "morning" ? MAP_POINTS.home.z : MAP_POINTS.office.z;
        const officeZ = trip === "morning" ? MAP_POINTS.office.z : MAP_POINTS.home.z;
        this.endMarkers[0].getTransform().setLocalPosition(new vec3(0, 0, homeZ));
        this.endMarkers[1].getTransform().setLocalPosition(new vec3(0, 0, officeZ));
        this.homeLabel.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(0, 0.3, homeZ + Math.sign(homeZ) * 5));
        this.officeLabel.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(0, 0.3, officeZ + Math.sign(officeZ) * 5));

        if (key !== this.lastKey) {
            this.lastKey = key;
            const from = view.mode === "planning" ? 0 : progress;
            const fork = sharedApproachFraction(trip);
            const join = 1 - fork;
            this.showRibbon(this.ribbonA, slicePolyline(ptsA, Math.max(from, fork), join), this.routeLineWidthCm);
            if (view.mode === "raincoat") {
                this.hideRibbon(this.ribbonB);
            } else {
                this.showRibbon(this.ribbonB, slicePolyline(ptsB, Math.max(from, fork), join), this.routeLineWidthCm);
            }
            // Draw shared roads once. Painting A then B over the same segment
            // falsely made the rider look as if they were already on B.
            if (from < fork) this.showRibbon(this.approach, slicePolyline(ptsA, from, fork), this.routeLineWidthCm);
            else this.hideRibbon(this.approach);
            this.showRibbon(this.destinationLeg, slicePolyline(ptsA, Math.max(from, join), 1), this.routeLineWidthCm);
            // The part already ridden, drawn dim along the route the rider is on (stopped only).
            const ridingRoute: RouteId = view.activeRoute === "B" ? "B" : "A";
            if (view.mode !== "planning" && progress > 0) {
                this.showRibbon(this.ridden, slicePolyline(ridingRoute === "B" ? ptsB : ptsA, 0, progress), this.routeLineWidthCm);
            } else {
                this.hideRibbon(this.ridden);
            }
            if (problem) {
                this.glow.rmv.mainMaterial = problem.kind === "rain" ? this.rainMat : this.crashMat;
                const pts = routePoints(trip, problem.route);
                this.showRibbon(this.glow, slicePolyline(pts, problem.fromFraction, problem.toFraction), GLOW_WIDTH_CM);
            } else {
                this.hideRibbon(this.glow);
            }
        }

        let riderAt: MapPoint;
        if (view.mode === "planning") {
            riderAt = pointAt(ptsA, 0);
        } else {
            const route: RouteId = view.activeRoute === "B" ? "B" : "A";
            riderAt = pointAt(route === "B" ? ptsB : ptsA, progress);
        }
        this.rider.getTransform().setLocalPosition(new vec3(riderAt.x, 0, riderAt.z));
        this.setYouAreHere(view.mode !== "planning");
        this.rider.enabled = true;
        for (const m of this.endMarkers) m.enabled = true;

        const dotsOn = view.mode !== "raincoat";
        this.setDotShown("A", dotsOn);
        this.setDotShown("B", dotsOn);
    }

    getVisibility(): {
        map: boolean; routeA: boolean; routeB: boolean; dotA: boolean; dotB: boolean;
        problemHighlight: boolean; progressMarks: boolean;
    } {
        if (!this.ready) {
            return {
                map: false, routeA: false, routeB: false, dotA: false, dotB: false,
                problemHighlight: false, progressMarks: false,
            };
        }
        const lines = this.routeLines.enabled;
        return {
            map: this.mapShown,
            routeA: lines && this.ribbonA.shown,
            routeB: lines && this.ribbonB.shown,
            dotA: this.dots.A.shown,
            dotB: this.dots.B.shown,
            problemHighlight: lines && this.glow.shown,
            progressMarks: lines && this.ridden.shown && this.youAreHere && this.rider.enabled,
        };
    }

    setInputEnabled(enabled: boolean): void {
        this.inputEnabled = enabled;
        if (!this.ready) return;
        this.gateDot("A");
        this.gateDot("B");
    }

    // ---- building (onAwake, own content only) ----

    private buildRouteLines(): void {
        this.routeLines = global.scene.createSceneObject(ROOT_NAMES.routeLines);
        this.routeLines.setParent(this.sceneObject);
        this.routeLines.getTransform().setLocalPosition(new vec3(0, ROUTE_LINES_Y, 0));

        this.ribbonA = this.makeRibbon("RouteARibbon", this.colouredMaterial(this.routeAColor), 0);
        this.ribbonB = this.makeRibbon("RouteBRibbon", this.colouredMaterial(this.routeBColor), 0);
        this.approach = this.makeRibbon("SharedApproachRibbon", this.colouredMaterial(new vec4(0.4, 0.48, 0.6, 1)), 0);
        this.destinationLeg = this.makeRibbon("SharedDestinationRibbon", this.colouredMaterial(new vec4(0.4, 0.48, 0.6, 1)), 0);
        this.crashMat = this.colouredMaterial(this.crashHighlightColor);
        this.rainMat = this.colouredMaterial(this.rainHighlightColor);
        this.glow = this.makeRibbon("ProblemGlow", this.crashMat, GLOW_Y);
        this.ridden = this.makeRibbon(ROOT_NAMES.riddenRoute, this.colouredMaterial(RIDDEN_COLOR), RIDDEN_Y);

        this.riderMat = this.colouredMaterial(new vec4(1, 1, 1, 1));
        this.youAreHereMat = this.colouredMaterial(YOU_ARE_HERE_COLOR);
        this.rider = this.makePuck(ROOT_NAMES.riderMarker, this.routeLines, RIDER_RADIUS_CM, RIDER_HEIGHT_CM,
            this.riderMat).obj;
        this.riderRmv = this.rider.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const endMat = this.colouredMaterial(new vec4(0.86, 0.91, 1, 1));
        const ends: [string, MapPoint][] = [[ROOT_NAMES.homeMarker, MAP_POINTS.home], ["OfficeMarker", MAP_POINTS.office]];
        for (const [name, p] of ends) {
            const m = this.makePuck(name, this.routeLines, END_RADIUS_CM, END_HEIGHT_CM, endMat).obj;
            m.getTransform().setLocalPosition(new vec3(p.x, 0, p.z));
            this.endMarkers.push(m);
        }
        this.homeLabel = this.makeMapLabel(this.routeLines, "HomeLabel", "Home", new vec3(10, 2.2, MAP_POINTS.home.z), 14);
        this.officeLabel = this.makeMapLabel(this.routeLines, "OfficeLabel", "Office", new vec3(10, 2.2, MAP_POINTS.office.z), 14);
    }

    /** Small upright labels face the rider; they hide with their map or dot. */
    private makeMapLabel(parent: SceneObject, name: string, text: string, position: vec3, width: number): Text {
        const panel = obj(parent, name, position);
        makeCardRect(panel, width, 2.6, { color: new vec4(0.26, 0.36, 0.5, 0.88), cornerRadius: 0.4 });
        const label = dynamicText(panel, text, "Caption", width - 0.6, 2, new vec4(1, 1, 1, 1));
        label.horizontalAlignment = HorizontalAlignment.Center;
        label.horizontalOverflow = HorizontalOverflow.Shrink;
        return label;
    }

    private colouredMaterial(color: vec4): Material {
        const mat = this.lineMaterial.clone();
        mat.mainPass.baseColor = color;
        return mat;
    }

    private makeRibbon(name: string, mat: Material, y: number): RibbonPart {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.routeLines);
        obj.getTransform().setLocalPosition(new vec3(0, y, 0));
        const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mainMaterial = mat;
        obj.enabled = false;
        return { obj: obj, rmv: rmv, mb: newMeshBuilder(), shown: false };
    }

    private makePuck(name: string, parent: SceneObject, r: number, h: number, mat: Material): { obj: SceneObject } {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(parent);
        const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const mb = newMeshBuilder();
        const g = new GeoBuffer();
        addPuck(g, r, h, PUCK_SEGMENTS);
        if (g.writeTo(mb)) rmv.mesh = mb.getMesh();
        rmv.mainMaterial = mat;
        return { obj: obj };
    }

    private buildDot(root: SceneObject, route: RouteId, color: vec4): DotPart {
        const material = this.colouredMaterial(color);
        const visual = this.makePuck("RouteDot" + route + "Visual", root, DOT_RADIUS_CM, DOT_HEIGHT_CM, material).obj;
        visual.getTransform().setLocalPosition(new vec3(0, -DOT_LOCAL_Y, 0)); // foot on the map surface
        this.makeMapLabel(visual, "Route" + route + "Label", route, new vec3(0, 2.2, 0), 3);

        let collider = root.getComponent("Physics.ColliderComponent") as ColliderComponent;
        if (!collider) collider = root.createComponent("Physics.ColliderComponent") as ColliderComponent;
        const shape = Shape.createSphereShape();
        shape.radius = DOT_COLLIDER_RADIUS_CM;
        collider.shape = shape;
        collider.fitVisual = false;

        let interactable = root.getComponent(Interactable.getTypeName()) as Interactable;
        if (!interactable) interactable = root.createComponent(Interactable.getTypeName()) as Interactable;

        return {
            root: root, visual: visual, material: material, baseColor: color,
            collider: collider, interactable: interactable, shown: false, hovered: false,
        };
    }

    // ---- interaction (subscribed in OnStartEvent) ----

    private bindDot(route: RouteId): void {
        const dot = this.dots[route];
        dot.interactable.onTriggerEnd.add(() => {
            if (!dot.shown || !this.inputEnabled) return;
            tiLog("dot picked route=" + route);
            this.dotPickedEvent.invoke({ route: route });
        });
        dot.interactable.onHoverEnter.add(() => {
            if (dot.shown && this.inputEnabled) this.setHover(dot, true);
            this.dotHoverEvent.invoke({ route: route, on: dot.hovered });
        });
        dot.interactable.onHoverExit.add(() => {
            this.setHover(dot, false);
            this.dotHoverEvent.invoke({ route: route, on: false });
        });
    }

    private setHover(dot: DotPart, on: boolean): void {
        if (dot.hovered === on) return;
        dot.hovered = on;
        const s = on ? this.dotHoverScale : 1;
        dot.visual.getTransform().setLocalScale(new vec3(s, s, s));
        const c = dot.baseColor;
        const k = on ? HOVER_WHITE_MIX : 0;
        dot.material.mainPass.baseColor = new vec4(c.x + (1 - c.x) * k, c.y + (1 - c.y) * k, c.z + (1 - c.z) * k, c.w);
    }

    // ---- view helpers ----

    private applyHidden(): void {
        this.setMapShown(false);
        this.routeLines.enabled = false;
        this.hideRibbon(this.ribbonA);
        this.hideRibbon(this.ribbonB);
        this.hideRibbon(this.glow);
        this.hideRibbon(this.ridden);
        this.setYouAreHere(false);
        this.lastKey = "hidden";
        this.setDotShown("A", false);
        this.setDotShown("B", false);
    }

    /** The rider marker becomes the larger bright "you are here" marker while stopped. */
    private setYouAreHere(on: boolean): void {
        this.youAreHere = on;
        const s = on ? YOU_ARE_HERE_SCALE : 1;
        this.rider.getTransform().setLocalScale(new vec3(s, s, s));
        this.riderRmv.mainMaterial = on ? this.youAreHereMat : this.riderMat;
    }

    private setMapShown(on: boolean): void {
        this.mapShown = on;
        this.cityMap.enabled = on;
    }

    private showRibbon(part: RibbonPart, points: MapPoint[], width: number): void {
        const g = new GeoBuffer();
        const ok = addRibbon(g, points, width) && g.writeTo(part.mb);
        if (ok) part.rmv.mesh = part.mb.getMesh();
        part.shown = ok;
        part.obj.enabled = ok;
    }

    private hideRibbon(part: RibbonPart): void {
        part.shown = false;
        part.obj.enabled = false;
    }

    /** Hides a dot via its visual child + collider + interactable; the dot object itself stays enabled. */
    private setDotShown(route: RouteId, shown: boolean): void {
        const dot = this.dots[route];
        dot.shown = shown;
        dot.visual.enabled = shown;
        this.gateDot(route);
    }

    private gateDot(route: RouteId): void {
        const dot = this.dots[route];
        const pickable = dot.shown && this.inputEnabled;
        if (!pickable) this.setHover(dot, false);
        dot.collider.enabled = pickable;
        dot.interactable.enabled = pickable;
    }
}
