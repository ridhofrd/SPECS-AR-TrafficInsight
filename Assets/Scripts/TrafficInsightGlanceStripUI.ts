/** Passive route overview. Main owns visibility; the map reuses the trip polyline. */
import { CanvasController } from "UIKit.lspkg/Scripts/Utility/CanvasController";
import { RoundedRectangle } from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { dynamicText, applyTextRole, makeCardRect, obj } from "./UIKitHelpers";
import { addPuck, addRibbon, GeoBuffer, newMeshBuilder } from "./TrafficInsightGeometry";
import { pointAt, slicePolyline } from "./TrafficInsightTripData";
import { GlanceFacts, MapPoint } from "./TrafficInsightTypes";
import { TrafficInsightHeadingFollow } from "./TrafficInsightHeadingFollow";

const BASE_MATERIAL = requireAsset("../Materials/RouteLineUnlit.mat") as Material;
const WIDTH = 24, HEIGHT = 18;
// Same map axes as the stopped view: origin near/below, destination ahead/above.
const SCALE_X = 0.34, SCALE_Z = 0.24;
const RIDDEN = new vec4(0.32, 0.4, 0.5, 1);
const RIDER = new vec4(1, 0.93, 0.2, 1);
interface Part { node: SceneObject; builder: MeshBuilder; material: Material; color: vec4 }

@component
export class TrafficInsightGlanceStripUI extends BaseScriptComponent {
    private panel: SceneObject;
    private plate: RoundedRectangle;
    private from: Text;
    private to: Text;
    private title: Text;
    private factsText: Text;
    private you: Text;
    private texts: Text[] = [];
    private parts: Part[] = [];
    private track: Part;
    private ridden: Part;
    private problem: Part;
    private rider: Part;
    private follow: TrafficInsightHeadingFollow;
    private facts: GlanceFacts = null;
    private shown = false;
    private opacity = 0;
    private key = "";

    onAwake(): void {
        this.follow = this.sceneObject.getComponent(TrafficInsightHeadingFollow.getTypeName());
        this.createEvent("OnStartEvent").bind(() => this.build());
    }

    setHeadingLocked(locked: boolean): void { if (this.follow) this.follow.setHeadingLocked(locked); }

    applyView(facts: GlanceFacts, shown: boolean, opacity: number): void {
        this.facts = facts;
        this.shown = shown && !!facts;
        this.opacity = this.shown ? Math.min(1, Math.max(0, opacity)) : 0;
        this.paint();
    }

    isVisible(): boolean { return !!this.panel && this.panel.isEnabledInHierarchy && this.opacity > 0; }
    getText(): string { return this.isVisible() && this.factsText ? this.factsText.text : ""; }
    getOpacity(): number { return this.isVisible() ? this.opacity : 0; }

    private build(): void {
        // Keep the scripted root enabled while hiding only its visual child.
        this.panel = obj(this.sceneObject, "GlanceStripPanel");
        new CanvasController(this.panel).ensure(new vec2(WIDTH, HEIGHT));
        this.plate = makeCardRect(obj(this.panel, "GlanceBacking"), WIDTH, HEIGHT, {
            color: new vec4(0.26, 0.36, 0.5, 0.88), cornerRadius: 0.8, border: true,
        });
        this.plate.borderColor = new vec4(0.69, 0.77, 0.88, 1);
        this.plate.borderSize = 0.12;
        this.title = this.label("GlanceTitle", 0, 7.5, 21.5, "Body");
        this.to = this.label("GlanceTo", 0, 5.65, 8, "Caption");
        this.from = this.label("GlanceFrom", 0, -5.65, 8, "Caption");
        // Muted street context; the selected trip route remains the only coloured corridor.
        const grid = new GeoBuffer();
        for (const z of [-17, -7, 7, 17]) addRibbon(grid, [{x:-26*SCALE_X,z:z*SCALE_Z},{x:26*SCALE_X,z:z*SCALE_Z}], 0.06);
        for (const x of [-25, 0, 25]) addRibbon(grid, [{x:x*SCALE_X,z:-20*SCALE_Z},{x:x*SCALE_X,z:20*SCALE_Z}], 0.06);
        this.mesh("GlanceStreets", grid, new vec4(0.42, 0.49, 0.59, 1), 0.15);
        this.track = this.ribbon("GlanceRoute", new vec4(0.15, 0.72, 1, 1), 0.25);
        this.ridden = this.ribbon("GlanceRidden", RIDDEN, 0.35);
        this.problem = this.ribbon("GlanceProblem", new vec4(1, 0.769, 0.42, 1), 0.45);
        this.marker("GlanceStart", {x:0,z:19}, 0.25, new vec4(0.86, 0.91, 1, 1));
        this.marker("GlanceDestination", {x:0,z:-19}, 0.25, new vec4(0.86, 0.91, 1, 1));
        this.rider = this.marker("GlanceRider", {x:0,z:19}, 0.43, RIDER);
        this.you = this.label("GlanceYou", 2.2, -3.8, 3.5, "Caption");
        this.you.text = "you";
        this.factsText = this.label("GlanceFacts", 0, -7.5, WIDTH - 1.2, "Body");
        this.paint();
    }

    private label(name: string, x: number, y: number, width: number, role: "Caption" | "Body"): Text {
        const host = obj(this.panel, name, new vec3(x, y, 0.8));
        const text = dynamicText(host, "", role, width, 1.5, new vec4(1, 1, 1, 1));
        applyTextRole(text, role, 100);
        text.horizontalOverflow = HorizontalOverflow.Shrink;
        this.texts.push(text);
        return text;
    }

    private mesh(name: string, geo: GeoBuffer, color: vec4, z: number): Part {
        const node = obj(this.panel, name, new vec3(0, 0, z));
        const builder = newMeshBuilder();
        geo.writeTo(builder);
        const visual = node.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const material = BASE_MATERIAL.clone();
        material.mainPass.blendMode = BlendMode.Normal;
        material.mainPass.depthWrite = false;
        material.mainPass.baseColor = color;
        visual.mesh = builder.getMesh();
        visual.mainMaterial = material;
        node.getTransform().setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.right()));
        const part = { node, builder, material, color };
        this.parts.push(part);
        return part;
    }

    private ribbon(name: string, color: vec4, z: number): Part {
        const geo = new GeoBuffer();
        addRibbon(geo, [{x:0,z:0},{x:0,z:1}], 0.2);
        return this.mesh(name, geo, color, z);
    }

    private marker(name: string, point: MapPoint, radius: number, color: vec4): Part {
        const geo = new GeoBuffer();
        addPuck(geo, radius, 0.06, 20);
        const part = this.mesh(name, geo, color, 0.6);
        this.placeMarker(part, point);
        return part;
    }

    private placeMarker(part: Part, point: MapPoint): void {
        part.node.getTransform().setLocalPosition(new vec3(point.x * SCALE_X, -point.z * SCALE_Z, 0.6));
    }

    private drawRoute(part: Part, points: MapPoint[], width: number): void {
        const geo = new GeoBuffer();
        part.node.enabled = addRibbon(geo, points.map(p => ({x:p.x*SCALE_X,z:p.z*SCALE_Z})), width);
        if (part.node.enabled) geo.writeTo(part.builder);
    }

    private paint(): void {
        if (!this.panel) return;
        this.panel.enabled = this.shown;
        const f = this.facts;
        if (f && this.shown) {
            const key = [f.route, f.progress, f.text, f.from, f.to].join("|");
            if (key !== this.key) {
                this.key = key;
                this.title.text = "Route " + f.route + " \u00b7 schematic";
                this.from.text = f.from;
                this.to.text = f.to;
                this.factsText.text = f.text;
                this.track.color = f.route === "A" ? new vec4(0.15, 0.72, 1, 1) : new vec4(0.2, 1, 0.45, 1);
                this.drawRoute(this.track, f.points, 0.24);
                this.drawRoute(this.ridden, slicePolyline(f.points, 0, f.progress), 0.26);
                this.problem.node.enabled = !!f.problem;
                if (f.problem) {
                    this.problem.color = f.problem.kind === "rain" ? new vec4(1, 0.769, 0.42, 1) : new vec4(1, 0.620, 0.541, 1);
                    this.drawRoute(this.problem, slicePolyline(f.points, Math.max(f.progress, f.problem.fromFraction), f.problem.toFraction), 0.5);
                }
                const at = pointAt(f.points, f.progress);
                this.placeMarker(this.rider, at);
                this.you.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(
                    Math.max(-9, Math.min(9, at.x*SCALE_X + 2.2)), -at.z*SCALE_Z + 0.8, 0.8));
            }
        }
        this.plate.opacity = this.opacity;
        for (const t of this.texts) t.textFill.color = new vec4(1, 1, 1, this.opacity);
        for (const part of this.parts) {
            const c = part.color;
            part.material.mainPass.baseColor = new vec4(c.x, c.y, c.z, this.opacity);
        }
    }
}
