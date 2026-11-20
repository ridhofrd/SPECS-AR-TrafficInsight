/**
 * Editor-only demo surroundings. Main supplies the same journey snapshot as
 * the Lens views; this component never changes trip state or accepts input.
 * Geometry is batched by material, built once, and absent on real glasses.
 */
import { GeoBuffer, addBox, newMeshBuilder } from "./TrafficInsightGeometry";
import { PreviewContextView, PreviewContextSnapshot } from "./TrafficInsightTypes";
import { applyTextRole, dynamicText, obj } from "./UIKitHelpers";
import { tiLog } from "./TrafficInsightSceneContracts";

const BASE_MATERIAL = requireAsset("../Materials/RouteLineUnlit.mat") as Material;
type RGB = [number, number, number];
interface Batch { parent: SceneObject; geometry: GeoBuffer; color: RGB; kind: string; material?: Material }

@component
export class TrafficInsightPreviewContext extends BaseScriptComponent {
    @input previewEnabled: boolean = true;
    private editor = false;
    private root: SceneObject;
    private places: { [key: string]: SceneObject } = {};
    private batches: { [key: string]: Batch } = {};
    private ahead: SceneObject;
    private here: SceneObject;
    private crash: SceneObject;
    private aheadDrops: SceneObject;
    private hereDrops: SceneObject;
    private lastKey = "";
    private view: PreviewContextView = { place: "home", light: "day", weather: "clear", crashAhead: false, planning: true };

    onAwake(): void {
        this.editor = global.deviceInfoSystem.isEditor();
        if (!this.editor || !this.previewEnabled) return;
        this.root = obj(this.sceneObject, "PreviewSurroundings");
        this.root.enabled = false;
        for (const place of ["home", "street", "office"]) this.places[place] = obj(this.root, "Preview" + place[0].toUpperCase() + place.slice(1));
        this.home();
        this.street();
        this.office();
        for (const key of Object.keys(this.batches)) {
            const batch = this.batches[key];
            const mesh = newMeshBuilder();
            if (!batch.geometry.writeTo(mesh)) continue;
            const node = obj(batch.parent, "ContextMesh_" + key);
            const visual = node.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            visual.mesh = mesh.getMesh();
            batch.material = BASE_MATERIAL.clone();
            visual.mainMaterial = batch.material;
        }
        this.createEvent("UpdateEvent").bind(() => {
            // Weather motion belongs to the simulated world, not a riding HUD.
            if (this.ahead.isEnabledInHierarchy) this.aheadDrops.getTransform().setLocalPosition(new vec3(0, -(getTime() * 90 % 100), 0));
            if (this.here.isEnabledInHierarchy) this.hereDrops.getTransform().setLocalPosition(new vec3(0, -(getTime() * 170 % 100), 0));
        });
        tiLog("preview surroundings built (editor only)");
    }

    applyView(view: PreviewContextView): void {
        this.view = view;
        if (!this.root) return;
        this.root.enabled = this.editor && this.previewEnabled;
        for (const place of ["home", "street", "office"]) this.places[place].enabled = place === view.place;
        // Planning is viewed seated at the existing 75 cm table; roadside and
        // arrival are standing. Keep the camera/UI fixed, offset the room floor.
        const seated = view.planning ? 62 : 0;
        this.places.home.getTransform().setLocalPosition(new vec3(0, seated, 0));
        this.places.office.getTransform().setLocalPosition(new vec3(0, seated, 0));
        this.ahead.enabled = view.weather === "rainAhead";
        this.here.enabled = view.weather === "rainHere";
        this.crash.enabled = view.crashAhead;
        const key = [view.place, view.light, view.weather, view.crashAhead, view.planning].join("|");
        if (key === this.lastKey) return;
        this.lastKey = key;
        const evening = view.light === "evening";
        for (const name of Object.keys(this.batches)) {
            const b = this.batches[name];
            if (!b.material) continue;
            const c = b.kind === "sky" ? (evening ? [0.20, 0.24, 0.36] : [0.63, 0.80, 0.94]) : b.color;
            const factor = evening && b.kind !== "glow" && b.kind !== "sky" ? 0.68 : 1;
            b.material.mainPass.baseColor = new vec4(c[0] * factor, c[1] * factor, c[2] * factor, 1);
        }
        tiLog("preview context=" + key);
    }

    getSnapshot(): PreviewContextSnapshot {
        const on = !!this.root && this.root.isEnabledInHierarchy;
        return {
            enabled: on,
            place: on ? this.view.place : "none",
            light: this.view.light,
            weather: on && this.ahead.isEnabledInHierarchy ? "rainAhead" : on && this.here.isEnabledInHierarchy ? "rainHere" : "clear",
            crashAhead: on && this.crash.isEnabledInHierarchy,
            visible: {
                home: on && this.places.home.isEnabledInHierarchy,
                street: on && this.places.street.isEnabledInHierarchy,
                office: on && this.places.office.isEnabledInHierarchy,
            },
        };
    }

    private box(parent: SceneObject, color: RGB, x: number, y: number, z: number, w: number, h: number, d: number, kind: string = "solid"): void {
        const key = parent.name + "_" + color.join("_") + "_" + kind;
        if (!this.batches[key]) this.batches[key] = { parent, color, kind, geometry: new GeoBuffer() };
        addBox(this.batches[key].geometry, x, y, z, w, h, d);
    }

    private sign(parent: SceneObject, text: string, x: number, y: number, z: number, width: number, distance: number): void {
        const panel = obj(parent, "ContextSign_" + text, new vec3(x, y, z));
        const label = dynamicText(panel, text, "Title1", width, 60, new vec4(0.96, 0.94, 0.84, 1));
        applyTextRole(label, "Title1", distance);
        label.horizontalAlignment = HorizontalAlignment.Center;
    }

    private plant(parent: SceneObject, x: number, z: number): void {
        this.box(parent, [0.59,0.35,0.25], x, -123, z, 46, 74, 46);
        this.box(parent, [0.28,0.47,0.31], x, -61, z, 85, 64, 62);
        this.box(parent, [0.37,0.57,0.38], x-22, -30, z+5, 54, 55, 44);
        this.box(parent, [0.22,0.40,0.29], x+25, -47, z-10, 49, 65, 52);
    }

    private home(): void {
        const r = this.places.home;
        const cream: RGB = [0.80,0.74,0.63], wood: RGB = [0.57,0.39,0.25], trim: RGB = [0.91,0.86,0.74];
        this.box(r, [0.66,0.49,0.34], 0,-165,-100, 1300,10,1500);
        for (let x=-600; x<=600; x+=75) this.box(r,[0.73,0.56,0.40],x,-159,-100,2,1,1500);
        this.box(r, cream, 0,55,-650,1300,430,20);
        this.box(r, [0.69,0.64,0.56], -650,55,-100,20,430,1100);
        this.box(r, [0.85,0.80,0.70], 650,55,-100,20,430,1100);
        this.box(r, trim, 0,275,-100,1300,15,1100);
        this.box(r, trim, 0,-145,-634,1300,28,12);
        // Window and upholstered bench make this a recognisable living room.
        this.box(r, trim, -190,80,-630,210,230,12);
        this.box(r, [0.50,0.70,0.78], -190,80,-621,182,200,4,"glow");
        this.box(r, trim, -190,80,-615,8,200,8);
        this.box(r, trim, -190,80,-615,182,8,8);
        this.box(r, wood, 170,-20,-630,120,280,20);
        this.box(r, [0.72,0.52,0.33], 170,-20,-617,98,254,8);
        this.box(r, [0.91,0.77,0.39], 135,-22,-607,10,10,8,"glow");
        this.box(r, [0.34,0.47,0.46], -160,-91,-430,240,100,110);
        this.box(r, [0.44,0.58,0.55], -160,-35,-471,240,70,28);
        this.box(r, [0.80,0.62,0.41], -205,-25,-410,60,45,18);
        this.box(r, [0.77,0.72,0.61], -110,-25,-410,60,45,18);
        this.box(r, [0.52,0.61,0.56], 0,-158,-110,240,1,180);
        this.box(r, wood, 0,82,-632,150,75,8);
        this.sign(r,"HOME",0,80,-625,140,620);
        this.plant(r,485,-420);
        // Warm ceiling fixture; it stays luminous on the evening arrival.
        this.box(r,[0.36,0.32,0.28],0,245,-250,4,60,4);
        this.box(r,[0.93,0.78,0.47],0,210,-250,100,22,70,"glow");
    }

    private office(): void {
        const r = this.places.office;
        const concrete: RGB = [0.65,0.69,0.71], frame: RGB = [0.31,0.39,0.45], glass: RGB = [0.37,0.59,0.69];
        this.box(r,[0.73,0.76,0.76],0,-165,-350,1900,10,2200);
        for(let x=-900;x<=900;x+=120) this.box(r,[0.61,0.65,0.67],x,-159,-350,3,1,2200);
        this.box(r,concrete,0,290,-1000,1900,900,60);
        // Central entry, canopy, side glazing and reception counter.
        this.box(r,frame,0,13,-955,360,346,25);
        for(const x of [-85,85]) this.box(r,glass,x,12,-938,155,310,10,"glow");
        this.box(r,[0.87,0.91,0.92],0,12,-927,7,310,7);
        for(const x of [-25,25]) this.box(r,[0.88,0.85,0.70],x,6,-919,6,55,8,"glow");
        for(const x of [-610,-390,390,610]) {
            this.box(r,frame,x,85,-960,200,480,20);
            this.box(r,glass,x,85,-945,180,456,8,"glow");
            this.box(r,frame,x,85,-936,180,8,10);
        }
        this.box(r,frame,0,280,-945,470,96,30);
        this.sign(r,"OFFICE",0,280,-923,440,920);
        this.box(r,[0.47,0.54,0.59],0,355,-800,760,28,420);
        for(const x of [-365,365]) this.box(r,[0.76,0.79,0.79],x,30,-650,32,380,32);
        this.box(r,[0.58,0.43,0.29],420,-100,-470,220,120,100);
        this.box(r,[0.88,0.88,0.82],420,-35,-470,236,12,110);
        this.plant(r,-370,-540);
        this.plant(r,660,-790);
        this.box(r,[0.24,0.36,0.43],0,-158,-610,360,2,240);
    }

    private street(): void {
        const r = this.places.street;
        const road: RGB = [0.40,0.43,0.48], paving: RGB = [0.66,0.68,0.67], paint: RGB = [0.86,0.88,0.86];
        // Match the existing stopped-road overlay, just below it to avoid z-fighting.
        this.box(r,[0.48,0.53,0.48],0,-171,-2600,11000,12,8000);
        this.box(r,road,0,-165,-2600,700,4,8000);
        this.box(r,road,1200,-165,-1490,2400,4,700);
        for(const x of [-430,430]) this.box(r,paving,x,-152,-2600,160,20,8000);
        for(const x of [-345,345]) this.box(r,[0.85,0.85,0.78],x,-139,-2600,14,12,8000);
        for(let z=100;z>-6000;z-=300) this.box(r,paint,0,-162,z,10,1,150);
        for(let x=-300;x<=300;x+=100) this.box(r,paint,x,-162,-2100,45,1,320);
        for(const x of [-110,110]) this.box(r,[0.78,0.80,0.78],x,-162,-600,8,1,220);
        this.city(r,-1);
        this.city(r,1);
        // Sky belongs to the preview world, not the rider-facing Lens layer.
        this.box(r,[0.63,0.80,0.94],0,2700,-7800,18000,6000,20,"sky");
        this.box(r,[0.63,0.80,0.94],-7800,2700,0,20,6000,18000,"sky");
        this.box(r,[0.63,0.80,0.94],7800,2700,0,20,6000,18000,"sky");
        this.box(r,[0.63,0.80,0.94],0,2700,7800,18000,6000,20,"sky");
        this.ahead = obj(r,"PreviewRainAhead");
        this.here = obj(r,"PreviewRainHere");
        this.crash = obj(r,"PreviewCrashAhead");
        this.aheadDrops = obj(this.ahead,"PreviewRainAheadDrops");
        this.hereDrops = obj(this.here,"PreviewRainHereDrops");
        this.rain(this.aheadDrops,2200,1900);
        this.rain(this.hereDrops,350,650);
        this.box(this.ahead,[0.43,0.48,0.58],-90,900,-3000,1200,180,350);
        this.box(this.ahead,[0.48,0.53,0.62],-350,1030,-3150,550,180,330);
        for(const z of [-2550,-2800,-3050]) {
            this.box(this.crash,[0.89,0.49,0.25],-140,-121,z,32,78,32);
            this.box(this.crash,paint,-140,-105,z+1,33,15,33);
        }
        this.box(this.crash,[0.48,0.33,0.29],-100,-110,-3000,150,85,250);
        this.box(this.crash,[0.39,0.53,0.59],-100,-39,-3000,125,60,130);
    }

    private city(r: SceneObject, side: number): void {
        const palette: RGB[] = [[0.64,0.60,0.52],[0.56,0.63,0.64],[0.69,0.65,0.58],[0.50,0.57,0.63]];
        for(let i=0;i<7;i++) {
            const x=side*(780+(i%2)*100), z=-650-i*740, height=600+(i%3)*220;
            this.box(r,palette[i%palette.length],x,-160+height/2,z,500,height,570);
            this.box(r,[0.35,0.40,0.43],x,-85,z+290,470,150,18);
            for(let row=0;row<3;row++) for(const dx of [-150,0,150]) {
                this.box(r,[0.63,0.75,0.78],x+dx,130+row*155,z+290,75,95,10,"glow");
            }
            this.box(r,[0.81,0.79,0.70],x,-7,z+330,500,22,100);
            if(i%2===0) {
                const pole=side*410;
                this.box(r,[0.39,0.43,0.45],pole,120,z+260,12,560,12);
                this.box(r,[0.88,0.85,0.64],pole-side*50,400,z+260,110,12,38,"glow");
            }
        }
    }

    private rain(parent: SceneObject, near: number, depth: number): void {
        for(let i=0;i<120;i++) {
            const x=((i*137)%900)-450, y=((i*83)%700)-80, z=-(near+(i*97)%depth);
            this.box(parent,[0.58,0.72,0.82],x,y,z,3,65,3,"glow");
        }
    }
}
