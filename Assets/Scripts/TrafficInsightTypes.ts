/**
 * TrafficInsightTypes.ts
 *
 * Owns: the shared type surface for TrafficInsight (trip, route, state, label,
 * visibility and snapshot shapes). Imported by every script, both UI modules
 * and the LEAF scenarios.
 * Inputs: none (types only).
 * Must not: contain logic, constants with behaviour, or scene access.
 */

/** The two sample trips: morning = Home -> Office, evening = Office -> Home. */
export type TripId = "morning" | "evening";
export type TripOrNone = TripId | "none";

/** The two alternative routes shown on the map. */
export type RouteId = "A" | "B";
export type RouteOrNone = RouteId | "none";

/** Top-level states of the state machine. */
export type StateName = "Planning" | "Riding" | "Alerted" | "Stopped" | "Arrived";

/** Sub-steps of the Planning state. */
export type PlanningStep = "idle" | "clarify" | "map";

/** What went wrong on the route. */
export type ProblemKind = "crash" | "rain";
export type ProblemKindOrNone = ProblemKind | "none";

/** Answer to the clarifying question ("Which office?"). */
export type OfficeId = "main" | "branch";
export type OfficeOrNone = OfficeId | "none";

/** Which phase's numbers a route label shows. */
export type TripPhase = "planning" | "stopped";

/** Sounds the audio controller can play (plus 'voice' for spoken lines, 'none' before any). */
export type SfxCue = "AlertChime" | "RouteSetTone" | "ArrivedTone" | "ButtonClick";
export type AudioCue = SfxCue | "voice" | "none";

/** One route label card (TrafficInsightTrafficLensUI.showRouteLabels). */
export interface RouteLabelData {
    /** "Route A · Recommended" or "Route A" */
    title: string;
    recommended: boolean;
    /** "Time: 52 min (+18)" */
    time: string;
    /** "Fuel: 0.5 L" */
    fuel: string;
    /** "Weather: Dry, 27 °C" */
    weather: string;
}

/** Problem stretch on a route, as fractions of that trip's route length (0..1). */
export interface ProblemSpan {
    route: RouteId;
    fromFraction: number;
    toFraction: number;
    kind: ProblemKind;
}

/** A point in map-local cm on MapRoot (x right, z toward the user). */
export interface MapPoint {
    x: number;
    z: number;
}

/** Plain xyz for LEAF-readable snapshots (no engine types). */
export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** What the map view should draw. Built by Main from the state snapshot. */
export type MapMode = "hidden" | "planning" | "stopped" | "raincoat";

export interface MapView {
    mode: MapMode;
    /** Ignored when mode === 'hidden'. */
    trip: TripOrNone;
    /** Rider progress 0..1 along the trip. */
    progress: number;
    /** Route the rider is on ('none' while planning). */
    activeRoute: RouteOrNone;
    /** Problem stretch to highlight, or null for none. */
    problem: ProblemSpan | null;
}

/** Visibility flags of everything the LEAF tests assert on. */
export interface LensVisibility {
    map: boolean;
    routeA: boolean;
    routeB: boolean;
    dotA: boolean;
    dotB: boolean;
    labelA: boolean;
    labelB: boolean;
    problemHighlight: boolean;
    problemCard: boolean;
    raincoatReminder: boolean;
    alertIcon: boolean;
    clarifyQuestion: boolean;
}

/** Domain state owned by TrafficInsightStateMachine. */
export interface StateCore {
    state: StateName;
    planningStep: PlanningStep;
    trip: TripOrNone;
    office: OfficeOrNone;
    /** 0..1 along the active trip. */
    progress: number;
    activeRoute: RouteOrNone;
    /** Computed (least time, then least fuel) for the current phase; 'none' without a trip. */
    recommendedRoute: RouteOrNone;
    alertFired: boolean;
    alertResolved: boolean;
    alertKind: ProblemKindOrNone;
    raincoatPrompt: boolean;
    /** True when the rider kept the crash route in morning Stopped. */
    keptProblemRoute: boolean;
    lastCaption: string;
    lastAudioCue: AudioCue;
    /** Progress from which the remaining routes are drawn (Stopped), else 0. */
    remainingFrom: number;
}

/** Result of one intent on the state machine. */
export interface IntentResult {
    /** True when state/planningStep/trip/route/progress or a flag changed. */
    changed: boolean;
    /** Caption to show (and log); undefined = keep the current caption. */
    caption?: string;
    /** Sound to play for this intent. */
    cue?: SfxCue;
    /** True when the caption should also be spoken (voice is optional). */
    speak?: boolean;
}

/** Full LEAF snapshot returned by TrafficInsightMain.getState(). */
export interface TrafficInsightSnapshot extends StateCore {
    labelTextA: string;
    labelTextB: string;
    problemCardText: string;
    visible: LensVisibility;
    alertIconCameraLocal: Vec3Like;
}
