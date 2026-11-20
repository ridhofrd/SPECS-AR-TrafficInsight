/**
 * TrafficInsightTripData.ts — edit sample trips here.
 *
 * Owns: the per-trip sample data (route numbers per phase, problem stretch,
 * alert and arrival lines, captions, route polylines in map-local cm) and the
 * pure helpers built on it: recommend() (least time, then least fuel), label
 * formatting and polyline math.
 * Inputs: none. The sample data is code constants on purpose; it is not
 * exposed in the Inspector.
 * Must not: access the scene, hold state or log.
 *
 * Map frame: map-local cm on MapRoot, x right, z toward the user, y up from
 * the map surface. The map is 60 x 40 (x ±30, z ±20); 6 map-cm = 1 km.
 */

import {
    MapPoint,
    OfficeOrNone,
    ProblemKind,
    ProblemSpan,
    RouteId,
    RouteOrNone,
    RouteLabelData,
    SfxCue,
    TripId,
    TripPhase,
} from "./TrafficInsightTypes";

/** Numbers shown on a route label card. */
export interface RouteStats {
    timeMin: number;
    /** Extra minutes versus the planned time (shown as "(+N)"). */
    deltaMin: number;
    fuelL: number;
    weather: string;
}

export interface TripProblem {
    route: RouteId;
    fromFraction: number;
    toFraction: number;
    km: string;
    cardText: string;
    /** Where the problem card sits (map-local); the UI step places ProblemCardRoot here. */
    cardAnchor: MapPoint;
}

export interface TripDef {
    id: TripId;
    from: string;
    to: string;
    progressLabel: string;
    alertAtProgress: number;
    alertKind: ProblemKind;
    alertIcon: string;
    problem: TripProblem;
    planning: { A: RouteStats; B: RouteStats };
    stopped: { A: RouteStats; B: RouteStats };
    arrivedLine: string;
    /** Morning only: arrival line when the rider kept the crash route. */
    arrivedLineKeptProblemRoute: string;
}

/** Progress is held here while an alert is unresolved ("Pull over to see options."). */
export const ALERT_PROGRESS_CAP = 0.14;

/** Map-cm per km (for reference; labels use the kilometre strings in TRIPS). */
export const MAP_CM_PER_KM = 6;

/** Key map points (map-local cm). */
export const MAP_POINTS = {
    home: { x: 0, z: 19 } as MapPoint,
    office: { x: 0, z: -19 } as MapPoint,
    junctionHomeSide: { x: 0, z: 7 } as MapPoint,
    junctionOfficeSide: { x: 0, z: -7 } as MapPoint,
    /** Route dots sit at the first bend after the split. */
    dotA: { x: -14, z: 7 } as MapPoint,
    dotB: { x: 14, z: 7 } as MapPoint,
};

/** Schematic route corridors; start is near, destination is far. */
const ROUTE_A_HOME_TO_OFFICE: MapPoint[] = [
    { x: 0, z: 19 },
    { x: 0, z: 7 },
    { x: -14, z: 7 },
    { x: -22, z: 0 },
    { x: -14, z: -7 },
    { x: 0, z: -7 },
    { x: 0, z: -19 },
];

const ROUTE_B_HOME_TO_OFFICE: MapPoint[] = [
    { x: 0, z: 19 },
    { x: 0, z: 7 },
    { x: 14, z: 7 },
    { x: 22, z: 0 },
    { x: 14, z: -7 },
    { x: 0, z: -7 },
    { x: 0, z: -19 },
];

const RAIN = { temperatureC: 24, intensity: "heavy", type: "windy rain" };

/** The two sample trips. */
export const TRIPS: { morning: TripDef; evening: TripDef } = {
    morning: {
        id: "morning",
        from: "Home",
        to: "Office",
        progressLabel: "Office trip",
        alertAtProgress: 0.1,
        alertKind: "crash",
        alertIcon: "car_crash",
        problem: {
            route: "A",
            fromFraction: 6 * MAP_CM_PER_KM / polylineLength(ROUTE_A_HOME_TO_OFFICE),
            toFraction: 8 * MAP_CM_PER_KM / polylineLength(ROUTE_A_HOME_TO_OFFICE),
            km: "6-8",
            cardText: "Crash, traffic stalled, +18 min",
            cardAnchor: { x: -18.5, z: -3 },
        },
        planning: {
            A: { timeMin: 34, deltaMin: 0, fuelL: 0.5, weather: "Dry, 27 °C" },
            B: { timeMin: 40, deltaMin: 0, fuelL: 0.6, weather: "Dry, 27 °C" },
        },
        stopped: {
            A: { timeMin: 52, deltaMin: 18, fuelL: 0.5, weather: "Dry, 27 °C" },
            B: { timeMin: 40, deltaMin: 0, fuelL: 0.6, weather: "Dry, 27 °C" },
        },
        arrivedLine: "You've arrived.",
        arrivedLineKeptProblemRoute: "You've arrived.",
    },
    evening: {
        id: "evening",
        from: "Office",
        to: "Home",
        progressLabel: "Home trip",
        alertAtProgress: 0.1,
        alertKind: "rain",
        alertIcon: "rainy",
        problem: {
            route: "A",
            fromFraction: 4 * MAP_CM_PER_KM / polylineLength(ROUTE_A_HOME_TO_OFFICE),
            toFraction: 7 * MAP_CM_PER_KM / polylineLength(ROUTE_A_HOME_TO_OFFICE),
            km: "4-7",
            cardText: "Rain km 4–7: 24 °C, heavy, windy rain",
            cardAnchor: { x: -18.5, z: -3 },
        },
        planning: {
            A: { timeMin: 36, deltaMin: 0, fuelL: 0.5, weather: "Dry, 26 °C" },
            B: { timeMin: 48, deltaMin: 0, fuelL: 0.6, weather: "Dry, 26 °C" },
        },
        stopped: {
            A: { timeMin: 36, deltaMin: 0, fuelL: 0.5, weather: RAIN.type + ", " + RAIN.temperatureC + " °C" },
            B: { timeMin: 48, deltaMin: 0, fuelL: 0.6, weather: "Dry, 26 °C" },
        },
        arrivedLine: "You've arrived.",
        arrivedLineKeptProblemRoute: "You've arrived.",
    },
};

/** Every fixed caption. Parametrised ones have helper functions below. */
export const CAPTIONS = {
    idle: "Pick a trip: Go to office or Go home.",
    clarify: "Which office: Main office or Branch office?",
    rideHint: "Riding. Press Ride to move along the route.",
    stoppedBeforeAlert: "Nothing ahead yet. Keep riding.",
    stoppedAfterResolved: "Your route is set. Keep riding.",
    capUnresolved: "Pull over to see options.",
    stoppedEnter: "Stopped. Pick a route.",
    reroute: "New route set",
    keepCrashRoute: "Staying on route A, +18 min.",
    raincoatPrompt: "Route A: rain ahead. Put on your raincoat before riding.",
    proceed: "Continuing on route A through rain.",
    raincoatOn: "Raincoat on. Ride safe.",
    rideBlockedPlanning: "Pick a route first.",
    rideBlockedStopped: "Pick a route to ride on.",
    rideBlockedArrived: "You've arrived. Pick a new trip.",
    tripBlocked: "Finish this trip first.",
    routeChoiceBlocked: "Route choice works when you're planning or stopped.",
};

/** The audio cue for each kind of moment (kept here so all wording/sound choices live together). */
export const CUES: { alert: SfxCue; routeSet: SfxCue; arrived: SfxCue; click: SfxCue } = {
    alert: "AlertChime",
    routeSet: "RouteSetTone",
    arrived: "ArrivedTone",
    click: "ButtonClick",
};

export function getTrip(trip: TripId): TripDef {
    return trip === "morning" ? TRIPS.morning : TRIPS.evening;
}

/**
 * Heading-up schematic: origin near the rider, destination ahead, A left/B
 * right in either sample trip. Home/office endpoint labels change with the
 * trip. These are illustrative corridors, not reversed geographic road data.
 */
export function routePoints(_trip: TripId, route: RouteId): MapPoint[] {
    const base = route === "A" ? ROUTE_A_HOME_TO_OFFICE : ROUTE_B_HOME_TO_OFFICE;
    const copy = base.map((p) => ({ x: p.x, z: p.z }));
    return copy;
}

export function polylineLength(points: MapPoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += segLength(points[i - 1], points[i]);
    }
    return total;
}

/** Point at a length fraction (0..1, clamped) along a polyline. */
export function pointAt(points: MapPoint[], fraction: number): MapPoint {
    if (points.length === 0) {
        return { x: 0, z: 0 };
    }
    if (points.length === 1) {
        return { x: points[0].x, z: points[0].z };
    }
    const f = clamp01(fraction);
    const target = polylineLength(points) * f;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const len = segLength(a, b);
        if (walked + len >= target || i === points.length - 1) {
            const t = len > 0 ? Math.min(1, Math.max(0, (target - walked) / len)) : 0;
            return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        }
        walked += len;
    }
    const last = points[points.length - 1];
    return { x: last.x, z: last.z };
}

/** The part of a polyline between two length fractions (inclusive end points). */
export function slicePolyline(points: MapPoint[], fromFraction: number, toFraction: number): MapPoint[] {
    if (points.length < 2) {
        return points.map((p) => ({ x: p.x, z: p.z }));
    }
    const f0 = clamp01(Math.min(fromFraction, toFraction));
    const f1 = clamp01(Math.max(fromFraction, toFraction));
    const total = polylineLength(points);
    const d0 = total * f0;
    const d1 = total * f1;
    const out: MapPoint[] = [pointAt(points, f0)];
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
        walked += segLength(points[i - 1], points[i]);
        if (walked > d0 && walked < d1) {
            out.push({ x: points[i].x, z: points[i].z });
        }
    }
    out.push(pointAt(points, f1));
    return out;
}

export function routeStats(trip: TripId, phase: TripPhase, route: RouteId): RouteStats {
    const def = getTrip(trip);
    const table = phase === "stopped" ? def.stopped : def.planning;
    return route === "A" ? table.A : table.B;
}

/** Costs from the actual rider position, not a second whole-trip estimate. */
export function remainingStats(trip: TripId, phase: TripPhase, route: RouteId, progress: number): RouteStats {
    const planned = getTrip(trip).planning[route];
    const updated = routeStats(trip, phase, route);
    const problem = getTrip(trip).problem;
    const passedProblem = clamp01((progress - problem.fromFraction) / (problem.toFraction - problem.fromFraction));
    const delay = Math.max(0, updated.timeMin - planned.timeMin) * (1 - passedProblem);
    return {
        timeMin: Math.max(0, planned.timeMin - plannedMinutesAt(trip, route, progress) + delay),
        deltaMin: delay,
        fuelL: Math.max(0, planned.fuelL - sharedLegValueAt(trip, progress, planned.fuelL, 0.05)),
        weather: updated.weather,
    };
}

/** Recommended route: least time, then least fuel; ties go to A. */
export function recommend(trip: TripId, phase: TripPhase): RouteId {
    const a = routeStats(trip, phase, "A");
    const b = routeStats(trip, phase, "B");
    if (a.timeMin !== b.timeMin) {
        return a.timeMin < b.timeMin ? "A" : "B";
    }
    if (a.fuelL !== b.fuelL) {
        return a.fuelL < b.fuelL ? "A" : "B";
    }
    return "A";
}

/** Label card data for one route in one phase. */
export function routeLabel(trip: TripId, phase: TripPhase, route: RouteId, progress: number = 0, activeRoute: RouteOrNone = "none"): RouteLabelData {
    const stats = remainingStats(trip, phase, route, progress);
    const recommended = recommend(trip, phase) === route;
    const stopped = phase === "stopped";
    const rainy = stopped && trip === "evening" && route === getTrip(trip).problem.route;
    const fastest = remainingStats(trip, phase, recommend(trip, phase), progress);
    const extra = Math.round(stats.timeMin - fastest.timeMin);
    const weather = rainy ? "Heavy rain, " + RAIN.temperatureC + " °C" : stats.weather;
    return {
        route: route,
        weatherKind: rainy ? "rain" : "dry",
        title: "Route " + route + (route === activeRoute ? " · Current" : stopped ? " · Alternative" : ""),
        recommended: recommended,
        time: (recommended ? "Fastest: " : "Time: ") + Math.round(stats.timeMin) + " min " + (stopped ? "left" : "total"),
        fuel: "Fuel: " + stats.fuelL.toFixed(2) + " L" + (stopped ? " left" : " total"),
        weather: weather + (stopped && trip === "evening" && !rainy && extra > 0 ? " · +" + extra + " min" : ""),
    };
}

/** One-line text form of a label (used in the LEAF snapshot and logs). */
export function labelToText(label: RouteLabelData): string {
    return [label.title, label.time, label.fuel, label.weather].join(" | ");
}

export function problemSpan(trip: TripId): ProblemSpan {
    const def = getTrip(trip);
    return {
        route: def.problem.route,
        fromFraction: def.problem.fromFraction,
        toFraction: def.problem.toFraction,
        kind: def.alertKind,
    };
}

export function problemCardText(trip: TripId, progress: number = getTrip(trip).alertAtProgress): string {
    const def = getTrip(trip);
    if (def.alertKind === "crash") return "Route A: crash ahead\nTraffic stalled · +18 min delay";
    const minutes = minutesToProblem(trip, progress);
    return "Route A: rain in " + minutes + " min\nkm " + def.problem.km + " · " + RAIN.temperatureC + " °C\n" + RAIN.intensity + ", " + RAIN.type;
}

export function alertLine(trip: TripId, progress: number = getTrip(trip).alertAtProgress): string {
    const def = getTrip(trip);
    if (def.alertKind === "crash") {
        return "Crash ahead on your route, traffic is stalled. Pull over to see options.";
    }
    const minutes = minutesToProblem(trip, progress);
    return "Rain on your route in " + minutes + " minutes. Pull over to see options.";
}

function minutesToProblem(trip: TripId, progress: number): number {
    const problem = getTrip(trip).problem;
    return Math.max(1, Math.round(plannedMinutesAt(trip, problem.route, problem.fromFraction) - plannedMinutesAt(trip, problem.route, progress)));
}

/** Both options share the same approach and final road, in both travel directions. */
export function sharedApproachFraction(trip: TripId): number {
    const points = routePoints(trip, "A");
    return segLength(points[0], points[1]) / polylineLength(points);
}

/**
 * Four sample minutes on each shared end road; the route's remaining time is
 * spent on its branch. Changing routes before the fork cannot change time
 * already ridden. These are simulation estimates, not a real routing service.
 */
export function plannedMinutesAt(trip: TripId, route: RouteId, progress: number): number {
    return sharedLegValueAt(trip, progress, getTrip(trip).planning[route].timeMin, 4);
}

function sharedLegValueAt(trip: TripId, progress: number, total: number, shared: number): number {
    const p = clamp01(progress);
    const fork = sharedApproachFraction(trip);
    if (p <= fork) return shared * p / fork;
    if (p >= 1 - fork) return total - shared + shared * (p - (1 - fork)) / fork;
    return shared + (total - 2 * shared) * (p - fork) / (1 - 2 * fork);
}

export function arrivedLine(trip: TripId, keptProblemRoute: boolean): string {
    const def = getTrip(trip);
    return keptProblemRoute ? def.arrivedLineKeptProblemRoute : def.arrivedLine;
}

export function progressLabel(trip: TripId): string {
    return getTrip(trip).progressLabel;
}

/** Rider identity and elapsed sample minutes, separate from the costs still ahead. */
export function progressCardText(trip: TripId, route: RouteId, progress: number): string {
    return "You are here · " + route + "\n" + Math.round(plannedMinutesAt(trip, route, progress)) + " min ridden";
}

/** "Main office trip: pick a route." / "Branch office trip: ..." / "Home trip: ..." */
export function planningMapCaption(trip: TripId, office: OfficeOrNone): string {
    let place = "Home";
    if (trip === "morning") {
        place = office === "branch" ? "Branch office" : "Main office";
    }
    return place + " trip: pick a route.";
}

/** "Route A set. Ride safe." */
export function routeSetCaption(route: RouteId): string {
    return "Route " + route + " set. Ride safe.";
}

function segLength(a: MapPoint, b: MapPoint): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
