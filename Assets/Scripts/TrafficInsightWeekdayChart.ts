/** Draws the selected weekday's historical route estimates on the departure card. */
import { TRAFFIC_SLOT_MINUTES, WeekdayTraffic } from "./TrafficInsightDeparture";
import { addRibbon, GeoBuffer, newMeshBuilder } from "./TrafficInsightGeometry";
import { MapPoint, RouteId } from "./TrafficInsightTypes";
import { dynamicText, obj } from "./UIKitHelpers";

const LINE_MATERIAL = requireAsset("../Materials/RouteLineUnlit.mat") as Material;
const LIGHT = new vec4(0.88, 0.9, 0.93, 1);
const GRID = new vec4(0.63, 0.71, 0.81, 1);
const PLOT = { left: -15.7, right: 19.3, bottom: -0.9, top: 5.15 };

interface ChartMesh {
    node: SceneObject;
    builder: MeshBuilder;
}

export class TrafficInsightWeekdayChart {
    private readonly root: SceneObject;
    private readonly title: Text;
    private readonly note: Text;
    private readonly plot: SceneObject;
    private readonly empty: Text;
    private readonly timeLabels: Text[];
    private readonly minuteLabels: Text[];
    private readonly grid: ChartMesh;
    private readonly a: ChartMesh;
    private readonly b: ChartMesh;

    constructor(parent: SceneObject, routeA: vec4, routeB: vec4) {
        this.root = obj(parent, "WeekdayTrafficChart");
        this.title = this.label(this.root, "WeekdayChartTitle", -0.5, 7.75, 43);
        this.note = this.label(this.root, "WeekdayChartNote", 0, -3.6, 42);
        this.empty = this.label(this.root, "WeekdayChartEmpty", 0, 2, 42);
        this.plot = obj(this.root, "WeekdayPlot");
        this.label(this.plot, "RideUnit", -18.3, 6.45, 5).text = "min";
        this.label(this.plot, "LegendA", 10.8, 6.45, 7, routeA).text = "Route A";
        this.label(this.plot, "LegendB", 18.3, 6.45, 7, routeB).text = "Route B";
        this.grid = this.mesh("WeekdayChartGrid", GRID, 0.25);
        this.a = this.mesh("WeekdayRouteA", routeA, 0.37);
        this.b = this.mesh("WeekdayRouteB", routeB, 0.49);
        this.timeLabels = Array.from({length: 8}, (_, i) => this.label(this.plot, "DepartureTime" + i, 0, -2.1, 6.1));
        this.minuteLabels = Array.from({length: 4}, (_, i) => this.label(this.plot, "RideMinutes" + i, -18.5, 0, 4.4));
        this.root.enabled = false;
    }

    draw(view: WeekdayTraffic | null): void {
        this.root.enabled = !!view;
        if (!view) return;
        this.title.text = view.title;
        this.note.text = view.source + " · Barcelona departure time · Route cards show Now";
        const hasData = view.slots.length > 0;
        this.empty.getSceneObject().enabled = !hasData;
        this.empty.text = "This day needs more traffic history";
        this.plot.enabled = hasData;
        if (!hasData) return;

        const from = view.timeTicks[0];
        const to = view.timeTicks[view.timeTicks.length - 1];
        const max = view.minuteTicks[view.minuteTicks.length - 1];
        const x = (minute: number) => PLOT.left + (PLOT.right - PLOT.left) * (minute - from) / (to - from);
        // Geometry ribbons use X/Z. After rotating the mesh, -Z faces up on the chart.
        const y = (minutes: number) => PLOT.bottom + (PLOT.top - PLOT.bottom) * minutes / max;
        const grid = new GeoBuffer();
        this.timeLabels.forEach((label, index) => {
            const minute = view.timeTicks[index];
            label.getSceneObject().enabled = minute !== undefined;
            if (minute === undefined) return;
            label.text = ("0" + minute / 60).slice(-2) + ":00";
            this.position(label, x(minute), -2.1);
            addRibbon(grid, [{x: x(minute), z: -PLOT.bottom}, {x: x(minute), z: -PLOT.top}], 0.05);
        });
        this.minuteLabels.forEach((label, index) => {
            const minutes = view.minuteTicks[index];
            label.text = String(minutes);
            this.position(label, -18.5, y(minutes));
            addRibbon(grid, [{x: PLOT.left, z: -y(minutes)}, {x: PLOT.right, z: -y(minutes)}], 0.07);
        });
        this.grid.node.enabled = grid.writeTo(this.grid.builder);
        this.drawRoute(view, "A", this.a, x, y);
        this.drawRoute(view, "B", this.b, x, y);
    }

    private drawRoute(view: WeekdayTraffic, route: RouteId, mesh: ChartMesh,
        x: (minute: number) => number, y: (minutes: number) => number): void {
        const geo = new GeoBuffer();
        let segment: MapPoint[] = [];
        let previous = -Infinity;
        const flush = () => {
            if (segment.length === 1) {
                const point = segment[0];
                addRibbon(geo, [{x: point.x - 0.13, z: point.z}, {x: point.x + 0.13, z: point.z}], 0.28);
            } else if (segment.length > 1) {
                addRibbon(geo, segment, 0.27);
            }
            segment = [];
        };
        for (const slot of view.slots) {
            if (slot.minute - previous > TRAFFIC_SLOT_MINUTES) flush();
            segment.push({x: x(slot.minute), z: -y(slot.times[route])});
            previous = slot.minute;
        }
        flush();
        mesh.node.enabled = geo.writeTo(mesh.builder);
    }

    private label(parent: SceneObject, name: string, x: number, y: number, width: number, color = LIGHT): Text {
        const text = dynamicText(obj(parent, name, new vec3(x, y, 0.67)), "", "Caption", width, 1.4, color);
        text.horizontalOverflow = HorizontalOverflow.Shrink;
        return text;
    }

    private position(label: Text, x: number, y: number): void {
        label.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(x, y, 0.67));
    }

    private mesh(name: string, color: vec4, z: number): ChartMesh {
        const node = obj(this.plot, name, new vec3(0, 0, z));
        node.getTransform().setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.right()));
        const builder = newMeshBuilder();
        const visual = node.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const material = LINE_MATERIAL.clone();
        material.mainPass.blendMode = BlendMode.Normal;
        material.mainPass.depthWrite = false;
        material.mainPass.baseColor = color;
        visual.mesh = builder.getMesh();
        visual.mainMaterial = material;
        return {node, builder};
    }
}
