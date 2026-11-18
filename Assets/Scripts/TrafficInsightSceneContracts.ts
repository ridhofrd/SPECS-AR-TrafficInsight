/**
 * TrafficInsightSceneContracts.ts
 *
 * Owns: the stable names every other part of the project agrees on —
 * SceneObject names (roots, buttons, dots), the log prefix, state names and
 * audio cue names. Imported by scripts, UI modules and LEAF scenarios.
 * Inputs: none.
 * Must not: access the scene or hold state.
 */

/** Every log line starts with this. */
export const LOG_PREFIX = "[TrafficInsight]";

/** Authored SceneObject names (created by the bootstrap, found by LEAF). */
export const ROOT_NAMES = {
    root: "TrafficInsightRoot",
    mapTable: "MapTable",
    mapRoot: "MapRoot",
    cityMap: "CityMap",
    routeLines: "RouteLines",
    routeDotA: "RouteDotA",
    routeDotB: "RouteDotB",
    routeLabelCardARoot: "RouteLabelCardARoot",
    routeLabelCardBRoot: "RouteLabelCardBRoot",
    problemCardRoot: "ProblemCardRoot",
    raincoatReminderRoot: "RaincoatReminderRoot",
    alertIconRoot: "AlertIconRoot",
    rideSimulatorRoot: "RideSimulatorRoot",
    clarifyDialogRoot: "ClarifyDialogRoot",
} as const;

/** Interactive element SceneObject names (UIKit buttons + SIK route dots). */
export const BUTTON_NAMES = {
    goToOffice: "GoToOfficeButton",
    goHome: "GoHomeButton",
    mainOffice: "MainOfficeButton",
    branchOffice: "BranchOfficeButton",
    ride: "RideButton",
    stopped: "StoppedButton",
    chooseRouteA: "ChooseRouteAButton",
    chooseRouteB: "ChooseRouteBButton",
    proceed: "ProceedButton",
    raincoatOn: "RaincoatOnButton",
    routeDotA: "RouteDotA",
    routeDotB: "RouteDotB",
} as const;

/** State names (match TrafficInsightTypes.StateName). */
export const STATE_NAMES = {
    planning: "Planning",
    riding: "Riding",
    alerted: "Alerted",
    stopped: "Stopped",
    arrived: "Arrived",
} as const;

/** Planning sub-steps (match TrafficInsightTypes.PlanningStep). */
export const PLANNING_STEPS = {
    idle: "idle",
    clarify: "clarify",
    map: "map",
} as const;

/** Audio cue names as they appear in 'audio=<cue>' log lines. */
export const AUDIO_CUES = {
    alertChime: "AlertChime",
    routeSetTone: "RouteSetTone",
    arrivedTone: "ArrivedTone",
    buttonClick: "ButtonClick",
    voice: "voice",
} as const;

/** console.log with the project prefix. */
export function tiLog(message: string): void {
    console.log(LOG_PREFIX + " " + message);
}

/** console.warn with the project prefix. */
export function tiWarn(message: string): void {
    console.warn(LOG_PREFIX + " " + message);
}

/** console.error with the project prefix. */
export function tiError(message: string): void {
    console.error(LOG_PREFIX + " " + message);
}
