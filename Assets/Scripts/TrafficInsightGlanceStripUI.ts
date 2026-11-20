/** Passive, non-interactive dashboard card. Main owns its visibility and fade. */
import { CanvasController } from "UIKit.lspkg/Scripts/Utility/CanvasController";
import { RoundedRectangle } from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { dynamicText, applyTextRole, makeCardRect, obj } from "./UIKitHelpers";
import { addBox, addPuck, GeoBuffer, newMeshBuilder } from "./TrafficInsightGeometry";
import { GlanceFacts } from "./TrafficInsightTypes";

const BASE_MATERIAL = requireAsset("../Materials/RouteLineUnlit.mat") as Material;
const WIDTH = 22, HEIGHT = 6, LINE = 18, LINE_Y = 0.6;
// Match the map's dim ridden stretch and yellow rider; route identity stays A blue/B green.
const RIDDEN = new vec4(0.32, 0.4, 0.5, 1);
const RIDER = new vec4(1, 0.93, 0.2, 1);
interface Part { node: SceneObject; material: Material; color: vec4 }

@component
export class TrafficInsightGlanceStripUI extends BaseScriptComponent {
    private panel: SceneObject;
    private plate: RoundedRectangle;
    private from: Text;
    private to: Text;
    private factsText: Text;
    private you: Text;
    private texts: Text[] = [];
    private parts: Part[] = [];
    private track: Part;
    private ridden: Part;
    private problem: Part;
    private rider: Part;
    private facts: GlanceFacts = null;
    private shown = false;
    private opacity = 0;
    private key = "";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.build());
    }

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
        // The scripted root stays enabled so heading follow continues while hidden.
        this.panel = obj(this.sceneObject, "GlanceStripPanel");
        new CanvasController(this.panel).ensure(new vec2(WIDTH, HEIGHT));
        this.plate = makeCardRect(obj(this.panel, "GlanceBacking"), WIDTH, HEIGHT, {
            color: new vec4(0.26, 0.36, 0.5, 0.88), cornerRadius: 0.8, border: true,
        });
        this.plate.borderColor = new vec4(0.69, 0.77, 0.88, 1);
        this.plate.borderSize = 0.12;
        this.from = this.label("GlanceFrom", -7.5, 2.0, 5, "Caption");
        this.to = this.label("GlanceTo", 7.5, 2.0, 5, "Caption");
        this.track = this.line("GlanceRoute", new vec4(0.15, 0.72, 1, 1), 0.18, 0.2);
        this.ridden = this.line("GlanceRidden", RIDDEN, 0.18, 0.3);
        this.problem = this.line("GlanceProblem", new vec4(1, 0.769, 0.42, 1), 0.42, 0.4);
        for (const x of [-LINE / 2, LINE / 2]) this.marker("GlanceEndpoint", x, 0.25, new vec4(0.86, 0.91, 1, 1));
        this.rider = this.marker("GlanceRider", -LINE / 2, 0.43, RIDER);
        this.you = this.label("GlanceYou", -LINE / 2, -0.45, 3.5, "Caption");
        this.you.text = "you";
        this.factsText = this.label("GlanceFacts", 0, -1.85, WIDTH - 1.2, "Body");
        this.paint();
    }

    private label(name: string, x: number, y: number, width: number, role: "Caption" | "Body"): Text {
        const host = obj(this.panel, name, new vec3(x, y, 0.5));
        const text = dynamicText(host, "", role, width, 1.5, new vec4(1, 1, 1, 1));
        applyTextRole(text, role, 100);
        text.horizontalOverflow = HorizontalOverflow.Shrink;
        this.texts.push(text);
        return text;
    }

    private mesh(name: string, geo: GeoBuffer, color: vec4): Part {
        const node = obj(this.panel, name);
        const builder = newMeshBuilder();
        geo.writeTo(builder);
        const visual = node.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const material = BASE_MATERIAL.clone();
        material.mainPass.blendMode = BlendMode.Normal;
        material.mainPass.depthWrite = false;
        material.mainPass.baseColor = color;
        visual.mesh = builder.getMesh();
        visual.mainMaterial = material;
        const part = { node, material, color };
        this.parts.push(part);
        return part;
    }

    private line(name: string, color: vec4, height: number, z: number): Part {
        const geo = new GeoBuffer();
        addBox(geo, 0, 0, 0, 1, height, 0.04);
        const p = this.mesh(name, geo, color);
        p.node.getTransform().setLocalPosition(new vec3(0, LINE_Y, z));
        return p;
    }

    private marker(name: string, x: number, radius: number, color: vec4): Part {
        const geo = new GeoBuffer();
        addPuck(geo, radius, 0.06, 20);
        const part = this.mesh(name, geo, color);
        part.node.getTransform().setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.right()));
        part.node.getTransform().setLocalPosition(new vec3(x, LINE_Y, 0.5));
        return part;
    }

    private span(part: Part, from: number, to: number): void {
        const t = part.node.getTransform();
        part.node.enabled = to > from;
        t.setLocalScale(new vec3(Math.max(0.001, LINE * (to - from)), 1, 1));
        const pos = t.getLocalPosition();
        t.setLocalPosition(new vec3(LINE * ((from + to) / 2 - 0.5), pos.y, pos.z));
    }

    private paint(): void {
        if (!this.panel) return;
        this.panel.enabled = this.shown;
        const f = this.facts;
        if (f && this.shown) {
            const key = [f.route, f.progress, f.text, f.from, f.to].join("|");
            if (key !== this.key) {
                this.key = key;
                this.from.text = f.from;
                this.to.text = f.to;
                this.factsText.text = f.text;
                this.track.color = f.route === "A" ? new vec4(0.15, 0.72, 1, 1) : new vec4(0.2, 1, 0.45, 1);
                this.span(this.track, 0, 1);
                this.span(this.ridden, 0, f.progress);
                this.problem.node.enabled = !!f.problem;
                if (f.problem) {
                    this.problem.color = f.problem.kind === "rain" ? new vec4(1, 0.769, 0.42, 1) : new vec4(1, 0.620, 0.541, 1);
                    this.span(this.problem, Math.max(f.progress, f.problem.fromFraction), f.problem.toFraction);
                }
                const x = LINE * (f.progress - 0.5);
                this.rider.node.getTransform().setLocalPosition(new vec3(x, LINE_Y, 0.6));
                this.you.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(Math.max(-8, Math.min(8, x)), -0.45, 0.5));
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
