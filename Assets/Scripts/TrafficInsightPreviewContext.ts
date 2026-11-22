/**
 * Editor-only demo surroundings. Main supplies the same journey snapshot as
 * the Lens views; this component never changes trip state or accepts input.
 * Geometry is batched by material, built once, and absent on real glasses.
 */
import { PreviewSurfaceBuffer, previewMeshBuilder, surfaceBox, surfaceCylinder, surfaceEllipsoid } from "./PreviewSurfaceGeometry";
import { PreviewContextView, PreviewContextSnapshot } from "./TrafficInsightTypes";
import { applyTextRole, dynamicText, obj } from "./UIKitHelpers";
import { tiLog } from "./TrafficInsightSceneContracts";

const BASE_MATERIAL = requireAsset("../Materials/RouteLineUnlit.mat") as Material;
const LIT_MATERIAL = requireAsset("../Materials/PreviewLitSurface.mat") as Material;
const SOLID_MATERIAL = requireAsset("../Materials/PreviewSolidPBR.mat") as Material;
const SKY_MATERIAL = requireAsset("../Materials/PreviewSky.mat") as Material;
const SKY_TEXTURE = requireAsset("../Textures/PreviewSurfaces/preview_sky.jpg") as Texture;
const SURFACES = {
    asphalt: [requireAsset("../Textures/PreviewSurfaces/asphalt_02_diff.jpg"), requireAsset("../Textures/PreviewSurfaces/asphalt_02_nor_gl.jpg")],
    concrete: [requireAsset("../Textures/PreviewSurfaces/concrete_wall_001_diff.jpg"), requireAsset("../Textures/PreviewSurfaces/concrete_wall_001_nor_gl.jpg")],
    wood: [requireAsset("../Textures/PreviewSurfaces/wood_floor_diff.jpg"), requireAsset("../Textures/PreviewSurfaces/wood_floor_nor_gl.jpg")],
};
type RGB = [number, number, number];
interface Batch { parent: SceneObject; geometry: PreviewSurfaceBuffer; color: RGB; kind: string; material?: Material }

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
    private environment: LightSource;
    private lastKey = "";
    private view: PreviewContextView = { place: "home", light: "day", weather: "clear", crashAhead: false, planning: true };

    onAwake(): void {
        this.editor = global.deviceInfoSystem.isEditor();
        if (!this.editor || !this.previewEnabled) return;
        this.root = obj(this.sceneObject, "PreviewSurroundings");
        this.root.enabled = false;
        const lightObject = obj(this.root, "PreviewEnvironmentLighting");
        this.environment = lightObject.createComponent("Component.LightSource") as LightSource;
        this.environment.lightType = LightType.Envmap;
        this.environment.diffuseEnvmapTexture = SKY_TEXTURE;
        this.environment.specularEnvmapTexture = SKY_TEXTURE;
        this.environment.intensity = 0.35;
        for (const place of ["home", "street", "office"]) this.places[place] = obj(this.root, "Preview" + place[0].toUpperCase() + place.slice(1));
        this.home();
        this.street();
        this.office();
        for (const key of Object.keys(this.batches)) {
            const batch = this.batches[key];
            const mesh = previewMeshBuilder();
            if (!batch.geometry.writeTo(mesh)) continue;
            const node = obj(batch.parent, "ContextMesh_" + key);
            const visual = node.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            visual.mesh = mesh.getMesh();
            batch.material = this.materialFor(batch.kind);
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
        this.environment.color = evening ? new vec3(0.63,0.70,0.90) : new vec3(1,0.96,0.88);
        this.environment.intensity = evening ? 0.17 : 0.35;
        for (const name of Object.keys(this.batches)) {
            const b = this.batches[name];
            if (!b.material) continue;
            const c = b.kind === "sky" ? (evening ? [0.13, 0.18, 0.29] : [0.72, 0.78, 0.86]) : b.color;
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

    private materialFor(kind: string): Material {
        if (kind === "sky") {
            const material = SKY_MATERIAL.clone();
            material.mainPass.baseTex = SKY_TEXTURE;
            material.mainPass.samplers.baseTex.filtering = FilteringMode.Trilinear;
            return material;
        }
        if (kind === "glow") return BASE_MATERIAL.clone();
        const textures = SURFACES[kind];
        const material = (textures ? LIT_MATERIAL : SOLID_MATERIAL).clone();
        if (textures) {
            material.mainPass.baseTex = textures[0] as Texture;
            material.mainPass.normalTex = textures[1] as Texture;
            for (const name of ["baseTex", "normalTex"]) {
                material.mainPass.samplers[name].wrap = WrapMode.Repeat;
                material.mainPass.samplers[name].filtering = FilteringMode.Trilinear;
            }
        }
        material.mainPass.roughness = kind === "glass" ? 0.18 : kind === "metal" ? 0.35 : kind === "wood" ? 0.62 : 0.86;
        material.mainPass.metallic = kind === "metal" ? 0.65 : kind === "glass" ? 0.28 : 0;
        return material;
    }

    private batch(parent: SceneObject, color: RGB, kind: string): Batch {
        const key = parent.name + "_" + color.join("_") + "_" + kind;
        if (!this.batches[key]) this.batches[key] = { parent, color, kind, geometry: new PreviewSurfaceBuffer() };
        return this.batches[key];
    }

    private box(parent: SceneObject, color: RGB, x: number, y: number, z: number, w: number, h: number, d: number, kind: string = "solid", bevel: number = 0): void {
        const tile = kind === "asphalt" ? 200 : kind === "wood" ? 180 : 150;
        surfaceBox(this.batch(parent,color,kind).geometry,x,y,z,w,h,d,tile,bevel);
    }

    private cylinder(parent: SceneObject, color: RGB, x: number, y: number, z: number, radius: number, height: number, topRadius: number = radius, kind: string = "solid"): void {
        surfaceCylinder(this.batch(parent,color,kind).geometry,x,y,z,radius,height,topRadius);
    }

    private oval(parent: SceneObject, color: RGB, x: number, y: number, z: number, rx: number, ry: number, rz: number, kind: string = "solid"): void {
        surfaceEllipsoid(this.batch(parent,color,kind).geometry,x,y,z,rx,ry,rz);
    }

    private sign(parent: SceneObject, text: string, x: number, y: number, z: number, width: number, distance: number): void {
        const panel = obj(parent, "ContextSign_" + text, new vec3(x, y, z));
        const label = dynamicText(panel, text, "Headline2", width, 60, new vec4(0.96, 0.94, 0.84, 1));
        applyTextRole(label, "Headline2", distance);
        label.horizontalAlignment = HorizontalAlignment.Center;
    }

    private plant(parent: SceneObject, x: number, z: number): void {
        this.cylinder(parent,[0.48,0.34,0.25],x,-139,z,21,42,27);
        this.cylinder(parent,[0.55,0.40,0.29],x,-119,z,28,6,28);
        this.cylinder(parent,[0.18,0.16,0.12],x,-117,z,24,2);
        for(let i=0;i<9;i++) {
            const a=i*2.4, reach=15+(i%3)*11, yy=-89+(i%4)*14;
            const xx=x+Math.cos(a)*reach, zz=z+Math.sin(a)*reach;
            this.cylinder(parent,[0.23,0.29,0.17],xx,yy-17,zz,1.2,45);
            this.oval(parent,[0.22+(i%3)*0.025,0.32+(i%2)*0.035,0.18],xx,yy+8,zz,13,29,9);
        }
    }

    private home(): void {
        const r = this.places.home;
        const cream: RGB = [0.68,0.64,0.57], wood: RGB = [0.72,0.66,0.55], trim: RGB = [0.75,0.73,0.66];
        this.box(r,[0.87,0.82,0.72],0,-165,-100,1100,10,1500,"wood");
        this.box(r,cream,0,-5,-650,1100,310,20);
        this.box(r,[0.59,0.59,0.54],-550,-5,-100,20,310,1100);
        this.box(r,[0.72,0.69,0.61],550,-5,-100,20,310,1100);
        this.box(r,trim,0,155,-100,1100,12,1100);
        this.box(r,trim,0,-151,-634,1100,16,7,"solid",1);
        this.box(r,trim,0,139,-634,1100,9,12,"solid",1);
        // Framed window, sill and pleated curtains behind the seating area.
        this.box(r,[0.35,0.35,0.30],-195,6,-632,226,205,12,"wood",2);
        this.box(r,[0.33,0.47,0.52],-195,6,-624,204,185,5,"glass");
        for(const x of [-297,-195,-93]) this.box(r,trim,x,6,-617,5,190,7,"solid",1);
        this.box(r,trim,-195,6,-617,208,5,7);
        this.box(r,trim,-195,-94,-611,242,9,32,"wood",2);
        this.box(r,[0.32,0.32,0.28],-195,119,-602,300,4,5,"metal");
        for(const side of [-1,1]) for(let i=0;i<5;i++) {
            this.cylinder(r,[0.65+(i%2)*0.035,0.63+(i%2)*0.035,0.56+(i%2)*0.035],-195+side*(119+i*10),-10,-604,7,242);
        }
        // A residential 2.1 m door with inset panels, trim and a lever handle.
        this.box(r,[0.31,0.27,0.22],170,-52,-632,112,216,15,"wood",2);
        this.box(r,wood,170,-53,-621,96,206,9,"wood",2);
        for(const y of [-100,-8]) this.box(r,[0.63,0.57,0.48],170,y,-614,72,70,4,"wood",2);
        for(const x of [112,228]) this.box(r,trim,x,-51,-613,7,220,8,"solid",1);
        this.box(r,trim,170,61,-613,123,8,8,"solid",1);
        this.box(r,[0.45,0.46,0.40],137,-57,-605,5,18,3,"metal",1);
        this.box(r,[0.50,0.51,0.45],145,-55,-601,18,3,4,"metal",1);
        // Seat height 46 cm above the floor; individual rounded cushions and feet.
        const upholstery: RGB=[0.31,0.36,0.34], cushion: RGB=[0.39,0.44,0.41];
        for(const x of [-260,-72]) for(const z of [-470,-390]) this.cylinder(r,[0.24,0.22,0.18],x,-151,z,4,18,3,"wood");
        this.box(r,upholstery,-166,-130,-430,224,29,100,"fabric",9);
        this.box(r,upholstery,-166,-92,-473,224,90,22,"fabric",9);
        for(const x of [-276,-56]) this.box(r,upholstery,x,-112,-426,23,63,100,"fabric",9);
        for(const x of [-216,-116]) {
            this.box(r,cushion,x,-121,-421,96,20,80,"fabric",8);
            this.box(r,cushion,x,-77,-460,96,61,20,"fabric",9);
        }
        this.box(r,[0.54,0.45,0.33],-243,-83,-442,40,40,16,"fabric",8);
        this.box(r,[0.56,0.55,0.48],-88,-83,-442,39,39,16,"fabric",8);
        this.box(r,[0.45,0.45,0.39],-45,-159,-300,360,1.2,260,"fabric",2);
        // Low side table and a few books provide scale without new hand targets.
        this.box(r,wood,4,-107,-451,58,7,58,"wood",3);
        for(const x of [-17,25]) for(const z of [-472,-430]) this.cylinder(r,[0.24,0.22,0.18],x,-134,z,2.5,49);
        for(let i=0;i<3;i++) this.box(r,[0.40+i*0.045,0.37+i*0.03,0.30],5,-101+i*3,-450,29-i*2,3,21,"solid",0.5);
        this.box(r,[0.29,0.29,0.25],0,65,-632,112,42,7,"wood",2);
        this.sign(r,"HOME",0,65,-627,108,620);
        this.plant(r,335,-540);
        this.cylinder(r,[0.27,0.27,0.24],-20,124,-250,1.5,55,1.5,"metal");
        this.cylinder(r,[0.72,0.66,0.49],-20,89,-250,32,23,22);
        this.cylinder(r,[0.82,0.75,0.57],-20,77,-250,30,1,30,"glow");
    }

    private office(): void {
        const r = this.places.office;
        const concrete: RGB = [0.75,0.77,0.75], frame: RGB = [0.27,0.31,0.33], glass: RGB = [0.28,0.40,0.45];
        this.box(r,[0.82,0.82,0.76],0,-165,-350,1900,10,2200,"concrete");
        for(let x=-900;x<=900;x+=120) this.box(r,[0.43,0.45,0.43],x,-159.7,-350,1,0.3,2200);
        for(let z=650;z>=-1400;z-=120) this.box(r,[0.43,0.45,0.43],0,-159.7,z,1900,0.3,1);
        this.box(r,concrete,0,290,-1000,1900,900,60,"concrete",3);
        this.box(r,[0.48,0.50,0.48],0,-115,-966,1900,90,12,"concrete");
        this.box(r,frame,0,-20,-955,290,280,25,"metal",2);
        for(const x of [-68,68]) this.box(r,glass,x,-21,-938,129,258,10,"glass");
        for(const x of [-137,0,137]) this.box(r,[0.55,0.57,0.55],x,-21,-927,5,264,7,"metal");
        this.box(r,[0.55,0.57,0.55],0,-155,-927,280,6,8,"metal");
        for(const x of [-20,20]) {
            this.cylinder(r,[0.62,0.63,0.58],x,-33,-917,2,47,2,"metal");
            for(const y of [-53,-13]) this.box(r,frame,x,y,-923,3,3,14,"metal");
        }
        for(const x of [-610,-390,390,610]) {
            this.box(r,frame,x,85,-960,200,480,20,"metal",2);
            this.box(r,glass,x,85,-945,186,464,8,"glass");
            for(const y of [-28,87,202]) this.box(r,frame,x,y,-936,186,5,10,"metal");
            this.box(r,frame,x,85,-935,5,464,10,"metal");
            this.box(r,[0.60,0.62,0.59],x,-160,-930,210,12,38,"concrete",2);
        }
        for(const y of [360,560]) this.box(r,[0.48,0.50,0.49],0,y,-962,1900,10,18,"concrete",1);
        this.box(r,frame,0,210,-945,375,65,15,"metal",3);
        this.sign(r,"OFFICE",0,210,-933,360,920);
        this.box(r,[0.42,0.45,0.45],0,303,-810,720,18,380,"metal",3);
        this.box(r,[0.71,0.70,0.60],0,293,-792,640,2,330,"glow");
        for(const x of [-340,340]) this.cylinder(r,[0.48,0.51,0.50],x,-9,-650,9,302,9,"metal");
        this.box(r,[0.79,0.75,0.64],465,-112,-660,200,96,80,"wood",5);
        this.box(r,[0.70,0.71,0.66],465,-61,-660,210,8,90,"concrete",3);
        for(const x of [390,540]) this.box(r,frame,x,-37,-664,31,43,5,"metal",2);
        this.plant(r,-270,-730);
        this.plant(r,660,-820);
        this.box(r,[0.25,0.29,0.28],0,-158,-760,295,2,150,"fabric",2);
    }

    private street(): void {
        const r = this.places.street;
        const paint: RGB = [0.77,0.77,0.71], curb: RGB = [0.83,0.81,0.75];
        this.box(r,[0.40,0.43,0.36],0,-177,-2700,11000,12,8500,"concrete");
        this.box(r,[0.92,0.94,0.97],0,-165,-2700,700,4,8500,"asphalt");
        this.box(r,[0.92,0.94,0.97],1200,-165,-1490,2400,4,700,"asphalt");
        for(const x of [-440,440]) {
            this.box(r,[0.87,0.85,0.80],x,-153,-2700,180,20,8500,"concrete");
            for(let z=700;z>-6500;z-=90) {
                this.box(r,[0.51,0.51,0.47],x,-142.7,z,170,0.4,1.2);
                this.box(r,curb,x-Math.sign(x)*86,-139,z,16,28,88,"concrete",2);
            }
        }
        for(let z=100;z>-6500;z-=300) this.box(r,paint,0,-162,z,10,0.5,140);
        for(let x=-275;x<=275;x+=85) this.box(r,paint,x,-162,-2100,42,0.5,290);
        // Narrow drainage channels and grates beside the road, rather than a flat toy street.
        for(const x of [-325,325]) for(const z of [-700,-2100,-3700]) {
            this.box(r,[0.17,0.20,0.20],x,-161,z,26,1,85,"metal");
            for(let k=-30;k<=30;k+=10) this.box(r,[0.40,0.43,0.41],x,-159.8,z+k,23,1.2,2,"metal");
        }
        this.city(r,-1);
        this.city(r,1);
        this.oval(r,[1,1,1],0,0,0,7800,7800,7800,"sky");
        this.ahead = obj(r,"PreviewRainAhead");
        this.here = obj(r,"PreviewRainHere");
        this.crash = obj(r,"PreviewCrashAhead");
        this.aheadDrops = obj(this.ahead,"PreviewRainAheadDrops");
        this.hereDrops = obj(this.here,"PreviewRainHereDrops");
        this.rain(this.aheadDrops,2600,1600,true);
        this.rain(this.hereDrops,350,650);
        for(const c of [[-130,380,-3200,310,62,180],[-300,425,-3350,175,75,155]])
            this.oval(this.ahead,[0.37,0.41,0.47],c[0],c[1],c[2],c[3],c[4],c[5]);
        for(const z of [-2550,-2800,-3050]) {
            this.box(this.crash,[0.26,0.27,0.25],-140,-155,z,42,7,42,"solid",3);
            this.cylinder(this.crash,[0.82,0.29,0.08],-140,-119,z,16,68,3);
            this.cylinder(this.crash,[0.85,0.84,0.77],-140,-111,z,10,14,7);
        }
        this.car(this.crash,-100,-3000,[0.31,0.34,0.36]);
    }

    private car(parent: SceneObject, x: number, z: number, color: RGB): void {
        this.box(parent,color,x,-109,z,150,76,300,"metal",18);
        this.box(parent,[0.20,0.28,0.31],x,-52,z+4,130,70,154,"glass",24);
        this.box(parent,color,x,-15,z+4,126,8,118,"metal",3);
        for(const side of [-1,1]) for(const end of [-1,1]) {
            this.oval(parent,[0.10,0.11,0.11],x+side*72,-135,z+end*93,13,31,31);
            this.oval(parent,[0.38,0.40,0.39],x+side*84,-135,z+end*93,2,18,18,"metal");
        }
        for(const dx of [-49,49]) {
            this.box(parent,[0.85,0.82,0.67],x+dx,-100,z+151,29,15,3,"glow",3);
            this.box(parent,[0.65,0.12,0.07],x+dx,-100,z-151,29,12,3,"glow",2);
        }
        this.box(parent,[0.68,0.70,0.67],x,-128,z+153,104,7,4,"metal",2);
    }

    private city(r: SceneObject, side: number): void {
        const palette: RGB[] = [[0.90,0.86,0.77],[0.76,0.82,0.84],[0.85,0.80,0.71],[0.73,0.76,0.76]];
        for(let i=0;i<7;i++) {
            const x=side*(810+(i%2)*80), z=-650-i*790, height=690+(i%3)*145;
            this.box(r,palette[i%4],x,-160+height/2,z,520,height,640,"concrete",4);
            this.box(r,[0.40,0.42,0.39],x,-110,z+327,520,100,15,"concrete");
            this.box(r,[0.69,0.67,0.61],x,-52,z+335,540,14,35,"concrete",2);
            this.box(r,[0.66,0.65,0.61],x,height-165,z,550,22,660,"concrete",3);
            for(let row=0;row<3;row++) for(const dx of [-165,0,165]) {
                const yy=110+row*165;
                this.box(r,[0.34,0.35,0.33],x+dx,yy,z+326,98,125,8,"metal",2);
                this.box(r,[0.24+row*0.025,0.35+row*0.02,0.40+row*0.02],x+dx,yy,z+332,82,109,5,"glass");
                this.box(r,[0.65,0.65,0.60],x+dx,yy-68,z+342,112,9,28,"concrete",2);
                this.box(r,[0.42,0.44,0.42],x+dx,yy,z+337,4,109,3,"metal");
                if((i+row)%3===0) this.box(r,[0.82,0.78,0.65],x+dx,yy,z+338,65,1.4,2,"glow");
            }
            // Recessed shopfronts, transoms, door frames and restrained fabric awnings.
            for(const dx of [-165,0,165]) {
                this.box(r,[0.27,0.29,0.28],x+dx,-103,z+340,150,108,8,"metal");
                this.box(r,[0.28,0.35,0.34],x+dx,-105,z+346,132,90,4,"glass");
                this.box(r,[0.58,0.60,0.56],x+dx,-74,z+351,134,4,3,"metal");
            }
            this.box(r,[0.34,0.37,0.31],x,-18,z+380,510,12,100,"fabric",3);
            if(i%2===0) {
                const pole=side*425;
                this.cylinder(r,[0.30,0.33,0.32],pole,80,z+270,5.5,480,4,"metal");
                this.box(r,[0.30,0.33,0.32],pole-side*44,320,z+270,95,7,9,"metal",3);
                this.box(r,[0.75,0.72,0.60],pole-side*78,315,z+270,48,4,30,"glow",2);
            }
            if(i===1 || i===4) {
                const treeX=side*510;
                this.box(r,[0.38,0.36,0.29],treeX,-142,z+180,85,7,100,"concrete",4);
                this.cylinder(r,[0.27,0.22,0.15],treeX,-15,z+180,11,250,7);
                for(let j=0;j<7;j++) {
                    const a=j*2.4;
                    this.oval(r,[0.25+(j%3)*0.025,0.34+(j%2)*0.03,0.20],treeX+Math.cos(a)*47,155+(j%3)*31,z+180+Math.sin(a)*44,72,87,65);
                }
            }
        }
    }

    private rain(parent: SceneObject, near: number, depth: number, distant: boolean = false): void {
        for(let i=0;i<120;i++) {
            const width = distant ? 360 : 900;
            const x=((i*137)%width)-width/2+(distant ? -130 : 0);
            const y=((i*83)%(distant ? 400 : 700))-(distant ? 140 : 80), z=-(near+(i*97)%depth);
            this.box(parent,[0.58,0.72,0.82],x,y,z,3,distant ? 45 : 65,3,"glow");
        }
    }
}
