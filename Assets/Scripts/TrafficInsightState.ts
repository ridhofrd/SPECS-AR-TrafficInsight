/**
 * TrafficInsightState.ts
 *
 * Owns: the TrafficInsight domain state (Planning -> Riding -> Alerted ->
 * Stopped -> Riding -> Arrived) and every transition between states, plus the
 * pure helpers that derive what is visible and what the map draws from a
 * state snapshot.
 * Inputs: none (pure module, no @component).
 * Must not: touch the scene, play audio, or log. Main turns IntentResults
 * into captions, sounds and view updates.
 */

import {
    AudioCue,
    IntentResult,
    LensVisibility,
    MapView,
    OfficeId,
    OfficeOrNone,
    PlanningStep,
    ProblemKindOrNone,
    RouteId,
    RouteOrNone,
    StateCore,
    StateName,
    TripOrNone,
} from "./TrafficInsightTypes";
import {
    ALERT_PROGRESS_CAP,
    CAPTIONS,
    CUES,
    alertLine,
    arrivedLine,
    getTrip,
    planningMapCaption,
    problemSpan,
    recommend,
    routeSetCaption,
} from "./TrafficInsightTripData";

const EPS = 1e-6;

function round4(v: number): number {
    return Math.round(v * 10000) / 10000;
}

export class TrafficInsightStateMachine {
    private state: StateName = "Planning";
    private planningStep: PlanningStep = "idle";
    private trip: TripOrNone = "none";
    private office: OfficeOrNone = "none";
    private progress = 0;
    private activeRoute: RouteOrNone = "none";
    private alertFired = false;
    private alertResolved = false;
    private alertKind: ProblemKindOrNone = "none";
    private raincoatPrompt = false;
    private keptProblemRoute = false;
    private lastCaption: string = CAPTIONS.idle;
    private lastAudioCue: AudioCue = "none";

    constructor() {}

    /** Fresh copy every call. */
    getCore(): StateCore {
        const recommendedRoute: RouteOrNone =
            this.trip === "none" ? "none" : recommend(this.trip, this.state === "Stopped" ? "stopped" : "planning");
        return {
            state: this.state,
            planningStep: this.planningStep,
            trip: this.trip,
            office: this.office,
            progress: this.progress,
            activeRoute: this.activeRoute,
            recommendedRoute: recommendedRoute,
            alertFired: this.alertFired,
            alertResolved: this.alertResolved,
            alertKind: this.alertKind,
            raincoatPrompt: this.raincoatPrompt,
            keptProblemRoute: this.keptProblemRoute,
            lastCaption: this.lastCaption,
            lastAudioCue: this.lastAudioCue,
            remainingFrom: this.state === "Stopped" ? this.progress : 0,
        };
    }

    goToOffice(): IntentResult {
        if (this.state === "Alerted") return this.idleResult();
        if (this.state === "Riding" || this.state === "Stopped") {
            return this.apply({ changed: false, caption: CAPTIONS.tripBlocked });
        }
        this.resetTrip();
        this.trip = "none";
        this.office = "none";
        this.state = "Planning";
        this.planningStep = "clarify";
        return this.apply({ changed: true, caption: CAPTIONS.clarify });
    }

    goHome(): IntentResult {
        if (this.state === "Alerted") return this.idleResult();
        if (this.state === "Riding" || this.state === "Stopped") {
            return this.apply({ changed: false, caption: CAPTIONS.tripBlocked });
        }
        this.resetTrip();
        this.trip = "evening";
        this.office = "none";
        this.state = "Planning";
        this.planningStep = "map";
        return this.apply({ changed: true, caption: planningMapCaption("evening", "none") });
    }

    answerOffice(office: OfficeId): IntentResult {
        if (this.state !== "Planning" || this.planningStep !== "clarify") return this.idleResult();
        this.trip = "morning";
        this.office = office;
        this.planningStep = "map";
        return this.apply({ changed: true, caption: planningMapCaption("morning", office) });
    }

    /** Route dots and 'Choose route X' buttons both call this. */
    chooseRoute(route: RouteId): IntentResult {
        if (this.state === "Alerted") return this.idleResult();

        if (this.state === "Planning" && this.planningStep === "map") {
            this.state = "Riding";
            this.activeRoute = route;
            this.progress = 0;
            return this.apply({ changed: true, caption: routeSetCaption(route), cue: CUES.routeSet, speak: true });
        }

        if (this.state === "Stopped") {
            if (this.raincoatPrompt && route === "A") {
                return this.apply({ changed: false, caption: CAPTIONS.raincoatPrompt });
            }
            if (route === "B") {
                this.state = "Riding";
                this.activeRoute = "B";
                this.alertResolved = true;
                this.raincoatPrompt = false;
                return this.apply({ changed: true, caption: CAPTIONS.reroute, cue: CUES.routeSet, speak: true });
            }
            if (this.trip === "morning") {
                this.state = "Riding";
                this.activeRoute = "A";
                this.alertResolved = true;
                this.keptProblemRoute = true;
                return this.apply({ changed: true, caption: CAPTIONS.keepCrashRoute, cue: CUES.routeSet, speak: true });
            }
            // Evening, route A: stay Stopped and ask about the raincoat.
            this.raincoatPrompt = true;
            this.activeRoute = "A";
            return this.apply({ changed: true, caption: CAPTIONS.raincoatPrompt, speak: true });
        }

        return this.apply({ changed: false, caption: CAPTIONS.routeChoiceBlocked });
    }

    ride(step: number): IntentResult {
        if (this.state === "Alerted") return this.idleResult();
        if (this.state === "Planning") return this.apply({ changed: false, caption: CAPTIONS.rideBlockedPlanning });
        if (this.state === "Stopped") return this.apply({ changed: false, caption: CAPTIONS.rideBlockedStopped });
        if (this.state === "Arrived") return this.apply({ changed: false, caption: CAPTIONS.rideBlockedArrived });

        // Riding.
        const trip = this.trip;
        if (trip === "none") return this.idleResult();
        const s = Math.min(1, Math.max(0.001, isFinite(step) ? step : 0.001));

        if (this.alertFired && !this.alertResolved) {
            const p = Math.min(round4(this.progress + s), ALERT_PROGRESS_CAP);
            const changed = p !== this.progress;
            this.progress = p;
            const caption = p >= ALERT_PROGRESS_CAP - EPS ? CAPTIONS.capUnresolved : CAPTIONS.rideHint;
            return this.apply({ changed: changed, caption: caption });
        }

        const p = round4(this.progress + s);
        const def = getTrip(trip);
        if (!this.alertFired && p >= def.alertAtProgress - EPS) {
            this.progress = Math.min(p, ALERT_PROGRESS_CAP);
            this.state = "Alerted";
            this.alertFired = true;
            this.alertKind = def.alertKind;
            return this.apply({ changed: true, caption: alertLine(trip), cue: CUES.alert, speak: true });
        }
        if (p >= 1 - EPS) {
            this.progress = 1;
            this.state = "Arrived";
            this.planningStep = "idle";
            return this.apply({
                changed: true,
                caption: arrivedLine(trip, this.keptProblemRoute),
                cue: CUES.arrived,
                speak: true,
            });
        }
        this.progress = p;
        return this.apply({ changed: true, caption: CAPTIONS.rideHint });
    }

    /** "I've stopped". */
    stopped(): IntentResult {
        switch (this.state) {
            case "Riding":
                if (!this.alertFired) return this.apply({ changed: false, caption: CAPTIONS.stoppedBeforeAlert });
                if (!this.alertResolved) {
                    this.state = "Stopped";
                    this.raincoatPrompt = false;
                    return this.apply({ changed: true, caption: CAPTIONS.stoppedEnter, speak: true });
                }
                return this.apply({ changed: false, caption: CAPTIONS.stoppedAfterResolved });
            case "Planning":
                if (this.planningStep === "idle") return this.apply({ changed: false, caption: CAPTIONS.idle });
                return this.apply({ changed: false, caption: CAPTIONS.rideBlockedPlanning });
            case "Arrived":
                return this.apply({ changed: false, caption: CAPTIONS.rideBlockedArrived });
            default:
                // Stopped, Alerted.
                return this.idleResult();
        }
    }

    /** Main calls this after the 2 s alert timer. The alert line stays as the caption. */
    endAlert(): IntentResult {
        if (this.state !== "Alerted") return this.idleResult();
        this.state = "Riding";
        return this.apply({ changed: true });
    }

    proceed(): IntentResult {
        return this.resolveRaincoat(CAPTIONS.proceed);
    }

    raincoatOn(): IntentResult {
        return this.resolveRaincoat(CAPTIONS.raincoatOn);
    }

    /** Records a cue played outside an intent (Main records ButtonClick before an intent). */
    noteAudioCue(cue: AudioCue): void {
        this.lastAudioCue = cue;
    }

    // ---- internals ----

    private resolveRaincoat(caption: string): IntentResult {
        if (this.state !== "Stopped" || !this.raincoatPrompt) return this.idleResult();
        this.state = "Riding";
        this.activeRoute = "A";
        this.alertResolved = true;
        this.raincoatPrompt = false;
        return this.apply({ changed: true, caption: caption, speak: true });
    }

    private resetTrip(): void {
        this.progress = 0;
        this.activeRoute = "none";
        this.alertFired = false;
        this.alertResolved = false;
        this.raincoatPrompt = false;
        this.keptProblemRoute = false;
        this.alertKind = "none";
    }

    private idleResult(): IntentResult {
        return { changed: false };
    }

    private apply(result: IntentResult): IntentResult {
        if (result.caption !== undefined) this.lastCaption = result.caption;
        if (result.cue !== undefined) this.lastAudioCue = result.cue;
        return result;
    }
}

function hiddenVisibility(): LensVisibility {
    return {
        table: false,
        map: false,
        routeA: false,
        routeB: false,
        dotA: false,
        dotB: false,
        labelA: false,
        labelB: false,
        problemHighlight: false,
        problemCard: false,
        raincoatReminder: false,
        alertIcon: false,
        clarifyQuestion: false,
    };
}

export function visibilityFor(core: StateCore): LensVisibility {
    const v = hiddenVisibility();
    if (core.state === "Planning") {
        // The table is there for the whole Planning state: at the start, during
        // the clarifying question, and under the map. Every other state hides it.
        v.table = true;
        if (core.planningStep === "clarify") {
            v.clarifyQuestion = true;
        } else if (core.planningStep === "map") {
            v.map = v.routeA = v.routeB = v.dotA = v.dotB = v.labelA = v.labelB = true;
        }
    } else if (core.state === "Stopped") {
        v.map = v.routeA = v.problemHighlight = v.problemCard = true;
        if (core.raincoatPrompt) {
            v.raincoatReminder = true;
        } else {
            v.routeB = v.dotA = v.dotB = v.labelA = v.labelB = true;
        }
    } else if (core.state === "Alerted") {
        v.alertIcon = true;
    }
    return v;
}

export function mapViewFor(core: StateCore): MapView {
    const mode: MapView["mode"] =
        core.state === "Planning" && core.planningStep === "map"
            ? "planning"
            : core.state === "Stopped"
              ? core.raincoatPrompt
                  ? "raincoat"
                  : "stopped"
              : "hidden";
    const trip = core.trip;
    return {
        mode: mode,
        trip: trip,
        progress: mode === "planning" ? 0 : core.progress,
        activeRoute: core.activeRoute,
        problem: core.state === "Stopped" && trip !== "none" ? problemSpan(trip) : null,
    };
}
