/**
 * TrafficInsightRouteMap.ts
 *
 * Owns: everything drawn on the city map — the route A / B ribbons, the
 * problem-stretch glow, the rider marker, the home / office end markers and
 * the two pickable route dots (IK Interactable + sphere collider).
 * Lives on: MapRoot (the map's top-surface centre; map-local x right, z toward
 * the user, y up). MapRoot, RouteDotA and RouteDotB are never disabled.
 * Inputs: cityMap, dotA, dotB, lineMaterial (cloned once per colour), line
 * width, route / highlight colours, dot hover scale.
 * Produces: onDotPicked, applyView(view), getVisibility(), setInputEnabled().
 * Must not: hold trip state (Main sends a MapView) or touch other scripts.
 * Size reason: the MeshBuilder ribbon/puck geometry helper lives here with the
 * view so the map stays one component; it has no other user.
 */

import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event, { PublicApi } from "InteractionKit.lspkg/Utils/Event";
import { MapPoint, MapView, ProblemSpan, RouteId, TripId } from "./TrafficInsightTypes";
import { MAP_POINTS, pointAt, routePoints, slicePolyline } from "./TrafficInsightTripData";
import { ROOT_NAMES, tiError, tiLog } from "./TrafficInsightSceneContracts";

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

/** Interleaved position / normal / uv buffer with outward-checked triangle winding. */
class GeoBuffer {
    private pos: number[] = [];
    data: number[] = [];
    idx: number[] = [];

    v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number): number {
        this.pos.push(x, y, z);
        this.data.push(x, y, z, nx, ny, nz, u, w);
        return this.pos.length / 3 - 1;
    }

    /** Adds a triangle whose front face points along (nx, ny, nz). */
    tri(a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
        const p = this.pos;
        const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * nx + cy * ny + cz * nz < 0) {
            this.idx.push(a, c, b);
        } else {
            this.idx.push(a, b, c);
        }
    }

    /** Replaces the builder's data with this buffer. False when there is nothing valid to draw. */
    writeTo(mb: MeshBuilder): boolean {
        if (mb.getIndicesCount() > 0) mb.eraseIndices(0, mb.getIndicesCount());
        if (mb.getVerticesCount() > 0) mb.eraseVertices(0, mb.getVerticesCount());
        if (this.idx.length === 0) return false;
        mb.appendVerticesInterleaved(this.data);
        mb.appendIndices(this.idx);
        if (!mb.isValid()) return false;
        mb.updateMesh();
        return true;
    }
}

function newMeshBuilder(): MeshBuilder {
    const mb = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "normal", components: 3, normalized: true },
        { name: "texture0", components: 2 },
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    return mb;
}

/** Flat cylinder, base at y=0, top at y=h. */
function addPuck(g: GeoBuffer, r: number, h: number, seg: number): void {
    const centre = g.v(0, h, 0, 0, 1, 0, 0.5, 0.5);
    const top: number[] = [];
    for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        top.push(g.v(cx * r, h, sz * r, 0, 1, 0, 0.5 + 0.5 * cx, 0.5 + 0.5 * sz));
    }
    for (let i = 0; i < seg; i++) {
        g.tri(centre, top[i], top[(i + 1) % seg], 0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
        const b0 = g.v(x0 * r, 0, z0 * r, x0, 0, z0, i / seg, 0);
        const t0 = g.v(x0 * r, h, z0 * r, x0, 0, z0, i / seg, 1);
        const b1 = g.v(x1 * r, 0, z1 * r, x1, 0, z1, (i + 1) / seg, 0);
        const t1 = g.v(x1 * r, h, z1 * r, x1, 0, z1, (i + 1) / seg, 1);
        const am = (a0 + a1) * 0.5;
        const nx = Math.cos(am), nz = Math.sin(am);
        g.tri(b0, b1, t1, nx, 0, nz);
        g.tri(b0, t1, t0, nx, 0, nz);
    }
}

function unitDir(a: MapPoint, b: MapPoint): MapPoint {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    return len > 1e-6 ? { x: dx / len, z: dz / len } : { x: 1, z: 0 };
}

/** Flat mitred strip at y=0 along a polyline. False when the polyline has no length. */
function addRibbon(g: GeoBuffer, points: MapPoint[], width: number): boolean {
    const pts: MapPoint[] = [];
    for (const p of points) {
        const last = pts[pts.length - 1];
        if (!last || Math.abs(last.x - p.x) + Math.abs(last.z - p.z) > 0.01) pts.push(p);
    }
    if (pts.length < 2) return false;
    const half = width * 0.5;
    const left: number[] = [];
    const right: number[] = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const d1 = i > 0 ? unitDir(pts[i - 1], p) : unitDir(p, pts[i + 1]);
        const d2 = i < pts.length - 1 ? unitDir(p, pts[i + 1]) : d1;
        const n1x = -d1.z, n1z = d1.x, n2x = -d2.z, n2z = d2.x;
        let mx = n1x + n2x, mz = n1z + n2z;
        const ml = Math.sqrt(mx * mx + mz * mz);
        if (ml < 1e-4) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
        const s = half / Math.max(0.35, mx * n1x + mz * n1z);
        if (i > 0) {
            const dx = p.x - pts[i - 1].x, dz = p.z - pts[i - 1].z;
            along += Math.sqrt(dx * dx + dz * dz);
        }
        left.push(g.v(p.x + mx * s, 0, p.z + mz * s, 0, 1, 0, along / width, 0));
        right.push(g.v(p.x - mx * s, 0, p.z - mz * s, 0, 1, 0, along / width, 1));
    }
    for (let i = 0; i < pts.length - 1; i++) {
        g.tri(left[i], right[i], left[i + 1], 0, 1, 0);
        g.tri(right[i], right[i + 1], left[i + 1], 0, 1, 0);
    }
    return true;
}

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
    @input @widget(new ColorWidget()) routeAColor: vec4 = new vec4(0.494, 0.784, 0.949, 1);
    @input @widget(new ColorWidget()) routeBColor: vec4 = new vec4(0.561, 0.890, 0.722, 1);
    @input @widget(new ColorWidget()) crashHighlightColor: vec4 = new vec4(1.0, 0.620, 0.541, 1);
    @input @widget(new ColorWidget()) rainHighlightColor: vec4 = new vec4(1.0, 0.769, 0.420, 1);
    @input @widget(new SliderWidget(1, 2, 0.05)) dotHoverScale: number = 1.25;

    private readonly dotPickedEvent = new Event<{ route: RouteId }>();
    private ready = false;
    private inputEnabled = true;
    private mapShown = false;
    private lastKey = "";

    private routeLines: SceneObject;
    private ribbonA: RibbonPart;
    private ribbonB: RibbonPart;
    private glow: RibbonPart;
    private crashMat: Material;
    private rainMat: Material;
    private rider: SceneObject;
    private endMarkers: SceneObject[] = [];
    private dots: { A: DotPart; B: DotPart };

    get onDotPicked(): PublicApi<{ route: RouteId }> {
        return this.dotPickedEvent.publicApi();
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
        const key = [view.mode, trip, progress, problem ? problem.route + problem.kind + problem.fromFraction + "-" + problem.toFraction : "-"].join("|");

        this.setMapShown(true);
        this.routeLines.enabled = true;
        const ptsA = routePoints(trip, "A");
        const ptsB = routePoints(trip, "B");

        if (key !== this.lastKey) {
            this.lastKey = key;
            const from = view.mode === "planning" ? 0 : progress;
            this.showRibbon(this.ribbonA, slicePolyline(ptsA, from, 1), this.routeLineWidthCm);
            if (view.mode === "raincoat") {
                this.hideRibbon(this.ribbonB);
            } else {
                this.showRibbon(this.ribbonB, slicePolyline(ptsB, from, 1), this.routeLineWidthCm);
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
        this.rider.enabled = true;
        for (const m of this.endMarkers) m.enabled = true;

        const dotsOn = view.mode !== "raincoat";
        this.setDotShown("A", dotsOn);
        this.setDotShown("B", dotsOn);
    }

    getVisibility(): { map: boolean; routeA: boolean; routeB: boolean; dotA: boolean; dotB: boolean; problemHighlight: boolean } {
        if (!this.ready) {
            return { map: false, routeA: false, routeB: false, dotA: false, dotB: false, problemHighlight: false };
        }
        const lines = this.routeLines.enabled;
        return {
            map: this.mapShown,
            routeA: lines && this.ribbonA.shown,
            routeB: lines && this.ribbonB.shown,
            dotA: this.dots.A.shown,
            dotB: this.dots.B.shown,
            problemHighlight: lines && this.glow.shown,
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
        this.crashMat = this.colouredMaterial(this.crashHighlightColor);
        this.rainMat = this.colouredMaterial(this.rainHighlightColor);
        this.glow = this.makeRibbon("ProblemGlow", this.crashMat, GLOW_Y);

        this.rider = this.makePuck("RiderMarker", this.routeLines, RIDER_RADIUS_CM, RIDER_HEIGHT_CM,
            this.colouredMaterial(new vec4(1, 1, 1, 1))).obj;
        const endMat = this.colouredMaterial(new vec4(0.86, 0.91, 1, 1));
        const ends: [string, MapPoint][] = [["HomeMarker", MAP_POINTS.home], ["OfficeMarker", MAP_POINTS.office]];
        for (const [name, p] of ends) {
            const m = this.makePuck(name, this.routeLines, END_RADIUS_CM, END_HEIGHT_CM, endMat).obj;
            m.getTransform().setLocalPosition(new vec3(p.x, 0, p.z));
            this.endMarkers.push(m);
        }
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
        });
        dot.interactable.onHoverExit.add(() => this.setHover(dot, false));
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
        this.lastKey = "hidden";
        this.setDotShown("A", false);
        this.setDotShown("B", false);
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
