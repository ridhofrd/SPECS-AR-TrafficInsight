/**
 * TrafficInsightMain.ts — entry script.
 *
 * Owns: the wiring between the views (ride simulator panel, Lens layer, route
 * map, audio) and the state machine. In OnStart it subscribes to every view
 * event; each event becomes one state-machine intent; after each intent it
 * re-renders every view from the state snapshot (one-way: state -> views).
 * It also runs the ~2 s Alerted timer and the alert icon fade, ignores all
 * input while Alerted, logs every transition with '[TrafficInsight]', and
 * exposes getState() / static getInstance() for the LEAF tests.
 *
 * Inputs (wired by the bootstrap): simulatorUI, lensUI, routeMap, audio,
 * alertFollow, roadView (ScriptComponents), cameraObject and table
 * (SceneObjects); tuning sliders.
 *
 * Must not: hold domain state (TrafficInsightState owns it), create text or
 * UIKit components, call into sibling components from onAwake, or disable a
 * SceneObject that carries a script.
 *
 * Size reason: this file is the single orchestration table (14 view events,
 * one render pass over 5 views, the alert timer, the LEAF snapshot and the
 * contract log lines). Splitting it would scatter the one-way render rule.
 */

import { branchAdvice, defaultTrafficWeekday, departureFor, isCollectedProfile, sampleCount, TrafficHistory, weekdayTraffic, WEEKDAYS } from "./TrafficInsightDeparture";
import { TrafficInsightRideSimulatorUI } from "./TrafficInsightRideSimulatorUI";
import { TrafficInsightTrafficLensUI } from "./TrafficInsightTrafficLensUI";
import { TrafficInsightRouteMap } from "./TrafficInsightRouteMap";
import { TrafficInsightRoadView } from "./TrafficInsightRoadView";
import { TrafficInsightAudioController } from "./TrafficInsightAudioController";
import { TrafficInsightLazyFollow } from "./TrafficInsightLazyFollow";
import { TrafficInsightPreviewContext } from "./TrafficInsightPreviewContext";
import { TrafficInsightGlanceStripUI } from "./TrafficInsightGlanceStripUI";
import { GlanceConfig, GlanceTriggerState, spentGlance, stepGlance } from "./TrafficInsightGlanceTrigger";
import { TrafficInsightStateMachine, mapViewFor, previewContextFor, roadViewFor, visibilityFor } from "./TrafficInsightState";
import { glanceFacts, labelToText, problemCardText, progressCardText, progressLabel, routeLabel } from "./TrafficInsightTripData";
import { BUTTON_NAMES, tiError, tiLog, tiWarn } from "./TrafficInsightSceneContracts";
import {
    IntentResult,
    LensVisibility,
    RouteId,
    RouteOrNone,
    StateCore,
    TrafficInsightSnapshot,
    Vec3Like,
} from "./TrafficInsightTypes";

/** Alert icon fade-in time (seconds). */
const ALERT_FADE_IN_SEC = 0.2;

@component
export class TrafficInsightMain extends BaseScriptComponent {
    private static instance: TrafficInsightMain = null;

    /** The running Main (for LEAF). Null before onAwake. */
    static getInstance(): TrafficInsightMain {
        return TrafficInsightMain.instance;
    }

    // Inspector toggle: wireframe every collider under the map (route dots). Read at start.
    @input
    debugColliders: boolean = false;

    @input
    simulatorUI: TrafficInsightRideSimulatorUI;

    @input
    lensUI: TrafficInsightTrafficLensUI;

    @input
    routeMap: TrafficInsightRouteMap;

    @input
    audio: TrafficInsightAudioController;

    @input
    alertFollow: TrafficInsightLazyFollow;

    // The mock street with both routes laid on it (shown only while Stopped).
    @input
    roadView: TrafficInsightRoadView;

    // Editor-only surroundings are demo scaffolding, like the simulator panel.
    @input @allowUndefined
    previewContext: TrafficInsightPreviewContext;

    @input @allowUndefined glanceStrip: TrafficInsightGlanceStripUI;
    @input glanceBaselineDeg: number = 0;
    @input glanceShowDeg: number = 20;
    @input glanceHideDeg: number = 12;
    @input glanceDwellSec: number = 0.3;
    @input glanceMaxShowDeg: number = 40;
    @input glanceMaxHideDeg: number = 45;
    @input glanceShowYawDeg: number = 15;
    @input glanceHideYawDeg: number = 22;
    @input glanceRearmDeg: number = 8;
    @input glanceRearmSec: number = 0.5;
    @input glanceFadeInSec: number = 0.15;
    @input glanceFadeOutSec: number = 0.3;

    @input
    cameraObject: SceneObject;

    // The virtual table (MapTable). Shown from visibilityFor(core).table only.
    @input
    table: SceneObject;

    @input
    @widget(new SliderWidget(0.01, 0.25, 0.01))
    rideStep: number = 0.05;

    @input
    @widget(new SliderWidget(1, 5, 0.1))
    alertDurationSec: number = 2.0;

    @input
    @widget(new SliderWidget(0.1, 1.5, 0.05))
    alertFadeSec: number = 0.5;

    // How long the picked route's stripe glows (the other fades) before riding starts.
    @input
    @widget(new SliderWidget(0.3, 3, 0.1))
    confirmDurationSec: number = 1.2;

    // Logs the 'visible ...' line after every render that changes it.
    @input
    verboseLogs: boolean = true;

    private sm: TrafficInsightStateMachine = null;
    private started = false;
    private refsOk = false;

    private alertActive = false;
    private alertStartTime = 0;

    private confirmActive = false;
    private confirmStartTime = 0;

    private labelTextA = "";
    private labelTextB = "";
    private problemText = "";
    private progressText = "";
    // Which route stripe the dots / buttons are being aimed at (only feeds the road view's highlight).
    private aimedRoute: RouteOrNone = "none";

    private lastStateKey = "";
    private lastVisibleKey = "";
    private glanceTrigger: GlanceTriggerState = spentGlance();
    private glanceOpacity = 0;
    private pitchOverride: number | null = null;
    private yawOverride: number | null = null;

    setHeadYawOverrideForTests(degrees: number | null): void {
        if (global.deviceInfoSystem.isEditor()) this.yawOverride = degrees !== null && isFinite(degrees) ? degrees : null;
    }

    private headYawToGlance(): number {
        if (this.yawOverride !== null) return this.yawOverride;
        if (!this.glanceStrip) return 0;
        const cam = this.cameraObject.getTransform();
        const f = cam.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
        const d = this.glanceStrip.getSceneObject().getTransform().getWorldPosition().sub(cam.getWorldPosition());
        return Math.atan2(f.x * d.z - f.z * d.x, f.x * d.x + f.z * d.z) * 180 / Math.PI;
    }

    /** Editor-only head-pose injection for LEAF; null restores the actual camera. */
    setHeadPitchOverrideForTests(degrees: number | null): void {
        if (global.deviceInfoSystem.isEditor()) this.pitchOverride = degrees !== null && isFinite(degrees) ? degrees : null;
    }

    private headPitch(): number {
        if (this.pitchOverride !== null) return this.pitchOverride;
        const f = this.cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
        return Math.atan2(-f.y, Math.sqrt(f.x * f.x + f.z * f.z)) * 180 / Math.PI;
    }

    private glanceConfig(): GlanceConfig {
        return { baselineDeg: this.glanceBaselineDeg, showDeg: this.glanceShowDeg, hideDeg: this.glanceHideDeg,
            dwellSec: this.glanceDwellSec, maxShowDeg: this.glanceMaxShowDeg, maxHideDeg: this.glanceMaxHideDeg,
            showYawDeg: this.glanceShowYawDeg, hideYawDeg: this.glanceHideYawDeg, rearmDeg: this.glanceRearmDeg,
            rearmSec: this.glanceRearmSec, fadeInSec: this.glanceFadeInSec, fadeOutSec: this.glanceFadeOutSec };
    }

    @input @allowUndefined internetModule: InternetModule;
    @input @hint("HTTPS URL of the exported traffic profile. Leave blank for bundled Preview data.")
    trafficProfileUrl: string = "";

    private weekday = -1;
    private departureGraphOpen = false;
    private nextTrafficRefresh = 0;
    private trafficPending = false;
    private history: TrafficHistory = null;
    private sampleTime = 0;
    private planningMinute = -1;

    onAwake(): void {
        TrafficInsightMain.instance = this;
        try {
            const asset = requireAsset("../TrafficHistory.json") as JsonAsset;
            this.history = JSON.parse(asset.getString());
        } catch (error) { tiWarn("Traffic history unavailable: " + error); }
        if (this.trafficProfileUrl && this.history && this.history.source === "sample") this.history = null;
        this.sm = new TrafficInsightStateMachine((trip, office) => {
            this.planningMinute = Math.floor(Date.now() / 60000);
            return office === "branch" ? branchAdvice() : departureFor(this.history, trip, this.planningMinute, this.sampleTime);
        });
        this.refsOk = this.validateInputs();
        if (!this.refsOk) {
            return;
        }
        // Everything cross-component waits for OnStart: siblings have not awoken yet.
        this.createEvent("OnStartEvent").bind(() => this.onStart());
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    /** LEAF snapshot of the whole experience. */
    getState(): TrafficInsightSnapshot {
        const core: StateCore = this.sm ? this.sm.getCore() : null;
        if (!core) {
            return null;
        }
        return {
            departure: core.departure,
            glance: core.glance,
            glanceText: this.started && this.glanceStrip ? this.glanceStrip.getText() : core.glanceText,
            glanceSource: core.glanceSource,
            glanceOpacity: this.glanceStrip ? this.glanceStrip.getOpacity() : 0,
            glancePhase: this.glanceTrigger.phase,
            headPitchDeg: this.started ? this.headPitch() : 0,
            state: core.state,
            planningStep: core.planningStep,
            trip: core.trip,
            office: core.office,
            progress: core.progress,
            activeRoute: core.activeRoute,
            recommendedRoute: core.recommendedRoute,
            alertFired: core.alertFired,
            alertResolved: core.alertResolved,
            alertKind: core.alertKind,
            raincoatPrompt: core.raincoatPrompt,
            keptProblemRoute: core.keptProblemRoute,
            lastCaption: core.lastCaption,
            lastAudioCue: core.lastAudioCue,
            remainingFrom: core.remainingFrom,
            confirmRoute: core.confirmRoute,
            labelTextA: this.labelTextA,
            labelTextB: this.labelTextB,
            problemCardText: this.problemText,
            progressCardText: this.progressText,
            roadHighlight: this.started ? this.roadView.getHighlight() : "none",
            roadChosen: this.started ? this.roadView.getChosen() : "none",
            visible: this.readVisibility(core),
            alertIconCameraLocal: this.alertIconCameraLocal(),
            previewContext: this.previewContext ? this.previewContext.getSnapshot() : null,
        };
    }

    // ---------------------------------------------------------------- start

    private onStart(): void {
        const ui = this.simulatorUI;
        ui.onGoToOffice.add(() => this.handle(BUTTON_NAMES.goToOffice, () => this.sm.goToOffice()));
        ui.onGoHome.add(() => this.handle(BUTTON_NAMES.goHome, () => this.sm.goHome()));
        ui.onAnswerOffice.add((e) =>
            this.handle(e.office === "branch" ? BUTTON_NAMES.branchOffice : BUTTON_NAMES.mainOffice, () =>
                this.sm.answerOffice(e.office)
            )
        );
        ui.onSampleTime.add(() => this.handle(BUTTON_NAMES.sampleTime, () => {
            const core = this.sm.getCore();
            if (!this.canChangeSample(core)) return { changed: false };
            this.sampleTime = (this.sampleTime + 1) % sampleCount;
            return this.sm.refreshDeparture();
        }));
        ui.onRide.add(() => this.handle(BUTTON_NAMES.ride, () => this.sm.ride(this.rideStep)));
        ui.onStopped.add(() => this.handle(BUTTON_NAMES.stopped, () => this.sm.stopped()));
        ui.onWhereAmI.add(() => this.handle(BUTTON_NAMES.whereAmI, () => this.sm.whereAmI()));
        ui.onHideRoute.add(() => this.handle(BUTTON_NAMES.hideRoute, () => this.sm.glanceEnd()));
        ui.onChooseRoute.add((e) =>
            this.handle(e.route === "B" ? BUTTON_NAMES.chooseRouteB : BUTTON_NAMES.chooseRouteA, () =>
                this.sm.chooseRoute(e.route)
            )
        );

        // Aiming at a dot or a "Choose route" button brightens that route's stripe on the road.
        ui.onRouteHover.add((e) => this.aim(e.route, e.on));
        this.routeMap.onDotHover.add((e: { route: RouteId; on: boolean }) => this.aim(e.route, e.on));
        // Pinching a stripe on the road is the same intent as pinching a dot.
        this.roadView.onLinePicked.add((e: { route: RouteId }) =>
            this.handle(e.route === "B" ? BUTTON_NAMES.roadLineB : BUTTON_NAMES.roadLineA, () =>
                this.sm.chooseRoute(e.route)
            )
        );
        this.roadView.onLineHover.add((e: { route: RouteId; on: boolean }) => this.aim(e.route, e.on));

        this.lensUI.onDepartureGraphToggle.add(open => this.handle(open ? BUTTON_NAMES.showDepartureGraph : BUTTON_NAMES.hideDepartureGraph, () => {
            const core = this.sm.getCore();
            if (!visibilityFor(core).departureCard || core.office === "branch") return { changed: false };
            this.departureGraphOpen = open;
            if (open && this.weekday < 0) this.weekday = defaultTrafficWeekday(this.history, this.planningMinute);
            return { changed: true };
        }));
        this.lensUI.onDepartureDay.add(day => this.handle(BUTTON_NAMES.departureWeekdayPrefix + WEEKDAYS[day], () => {
            if (!this.departureGraphOpen) return { changed: false };
            this.weekday = day;
            return { changed: true };
        }));
        this.lensUI.onProceed.add(() => this.handle(BUTTON_NAMES.proceed, () => this.sm.proceed()));
        this.lensUI.onRaincoatOn.add(() => this.handle(BUTTON_NAMES.raincoatOn, () => this.sm.raincoatOn()));

        this.routeMap.onDotPicked.add((e: { route: RouteId }) =>
            this.handle(e.route === "B" ? BUTTON_NAMES.routeDotB : BUTTON_NAMES.routeDotA, () =>
                this.sm.chooseRoute(e.route)
            )
        );

        if (this.debugColliders) {
            this.setColliderDebugAll(this.routeMap.getSceneObject(), true);
        }

        this.started = true;
        this.lensUI.hideAll();
        const core = this.sm.getCore();
        this.simulatorUI.setCaption(core.lastCaption);
        this.render();
        tiLog("ready");
        this.logState(core, true);
        tiLog("caption=" + core.lastCaption);
    }

    // --------------------------------------------------------------- intents

    /** Every input goes through here: gate, click, intent, feedback, render, log. */
    private handle(source: string, intent: () => IntentResult): void {
        if (!this.started) {
            return;
        }
        const before = this.sm.getCore();
        if (before.state === "Alerted" || before.confirmRoute !== "none") {
            tiLog("input ignored state=" + before.state + " source=" + source);
            return;
        }
        this.audio.play("ButtonClick");
        this.sm.noteAudioCue("ButtonClick");

        if (source === BUTTON_NAMES.whereAmI || source === BUTTON_NAMES.hideRoute) {
            this.glanceTrigger = spentGlance();
            this.glanceOpacity = 0;
        }

        const res = intent();
        this.applyResult(before, res);
    }

    private applyResult(before: StateCore, res: IntentResult): void {
        if (res.caption !== undefined && res.caption !== null) {
            this.simulatorUI.setCaption(res.caption);
            tiLog("caption=" + res.caption);
        }
        if (res.cue) {
            this.audio.play(res.cue);
        }
        if (res.speak && res.caption) {
            this.audio.speak(res.caption);
        }

        const after = this.sm.getCore();
        if (after.trip !== before.trip || after.office !== before.office) {
            this.departureGraphOpen = false;
            this.weekday = -1;
        }
        if (after.state !== before.state) {
            this.glanceTrigger = spentGlance();
            this.glanceOpacity = 0;
        }
        this.render();
        if (after.state === "Alerted" && before.state !== "Alerted") {
            this.beginAlert(after);
        }
        if (after.confirmRoute !== "none" && before.confirmRoute === "none") {
            this.confirmActive = true;
            this.confirmStartTime = getTime();
        }
        this.logState(after, false);
    }

    /** Remembers which route is being aimed at; render() hands it to the road view. */
    private aim(route: RouteId, on: boolean): void {
        if (!this.started) {
            return;
        }
        this.aimedRoute = on ? route : this.aimedRoute === route ? "none" : this.aimedRoute;
        this.roadView.setExternalHover(this.aimedRoute);
    }

    // ---------------------------------------------------------------- alert

    private beginAlert(core: StateCore): void {
        if (core.alertKind === "none") {
            return;
        }
        this.alertActive = true;
        this.alertStartTime = getTime();
        this.alertFollow.snapToTarget();
        this.lensUI.showAlertIcon(core.alertKind);
        this.lensUI.setAlertIconOpacity(0);
        this.logVisible(this.sm.getCore());
    }

    private canChangeSample(core: StateCore): boolean {
        return !!this.history && this.history.source === "sample" && core.office !== "branch" &&
            core.state === "Planning" && core.planningStep === "map";
    }

    private onUpdate(): void {
        if (!this.started) {
            return;
        }
        const minute = Math.floor(Date.now() / 60000);
        if ((this.trafficProfileUrl || (this.history && this.history.source === "collected")) && this.planningMinute !== minute) {
            this.planningMinute = minute;
            if (this.sm.refreshDeparture().changed) this.render();
        }
        if (this.trafficProfileUrl && getTime() >= this.nextTrafficRefresh && !this.trafficPending) {
            const core = this.sm.getCore();
            if (visibilityFor(core).departureCard && core.office !== "branch") this.refreshTraffic();
        }
        if (this.confirmActive && getTime() - this.confirmStartTime >= Math.max(0.3, this.confirmDurationSec)) {
            this.confirmActive = false;
            const before = this.sm.getCore();
            this.applyResult(before, this.sm.finishConfirm());
        }
        this.updateGlance();
        if (!this.alertActive) {
            return;
        }
        const elapsed = getTime() - this.alertStartTime;
        const duration = Math.max(0.5, this.alertDurationSec);
        const fadeOut = Math.min(Math.max(0.05, this.alertFadeSec), duration);
        let alpha = Math.min(1, elapsed / ALERT_FADE_IN_SEC);
        const outStart = duration - fadeOut;
        if (elapsed > outStart) {
            alpha = Math.min(alpha, Math.max(0, (duration - elapsed) / fadeOut));
        }
        this.lensUI.setAlertIconOpacity(alpha);

        if (elapsed >= duration) {
            this.alertActive = false;
            const before = this.sm.getCore();
            const res = this.sm.endAlert();
            this.lensUI.hideAlertIcon();
            this.applyResult(before, res);
        }
    }

    private async refreshTraffic(): Promise<void> {
        this.nextTrafficRefresh = getTime() + 60;
        if (!this.internetModule || !/^https:\/\//i.test(this.trafficProfileUrl)) {
            tiWarn("Traffic profile requires an Internet Module and HTTPS URL");
            return;
        }
        this.trafficPending = true;
        try {
            const response = await this.internetModule.fetch(this.trafficProfileUrl);
            if (!response.ok) throw new Error("HTTP " + response.status);
            const profile = await response.json() as TrafficHistory;
            if (!isCollectedProfile(profile)) throw new Error("unexpected traffic profile");
            this.history = profile;
            if (this.sm.refreshDeparture().changed) this.render();
        } catch (error) {
            tiWarn("Traffic profile refresh failed: " + error);
        } finally { this.trafficPending = false; }
    }

    private updateGlance(): void {
        const core = this.sm.getCore();
        const tick = stepGlance(this.glanceTrigger, this.headPitch(), getTime(), core.state === "Riding", this.glanceConfig(), this.headYawToGlance());
        this.glanceTrigger = tick.state;
        this.glanceOpacity = tick.opacity;
        if (tick.visible !== core.glance) {
            this.applyResult(core, tick.visible ? this.sm.glanceStart() : this.sm.glanceEnd());
        } else this.renderGlance(core);
    }

    private renderGlance(core: StateCore): void {
        if (!this.glanceStrip) return;
        this.glanceStrip.setHeadingLocked(core.state === "Riding" &&
            (this.glanceTrigger.phase !== "Ready" || core.glance || this.headPitch() - this.glanceBaselineDeg >= this.glanceHideDeg));
        this.simulatorUI.setGlanceVisible(core.glance);
        const facts = core.trip !== "none" && core.activeRoute !== "none"
            ? glanceFacts(core.trip, core.activeRoute, core.progress, core.alertFired, core.departure && core.departure.minutes) : null;
        this.glanceStrip.applyView(facts, visibilityFor(core).glanceStrip, this.glanceOpacity);
    }

    // --------------------------------------------------------------- render

    /** Paint every view from the snapshot. Lens-layer visibility = visibilityFor(core). */
    private render(): void {
        if (!this.started) {
            return;
        }
        const core = this.sm.getCore();
        const vis = visibilityFor(core);
        this.renderGlance(core);
        if (this.previewContext) this.previewContext.applyView(previewContextFor(core));
        // No hand input while an alert shows or while a just-picked route is being confirmed.
        const inputOk = core.state !== "Alerted" && core.confirmRoute === "none";

        // Ride simulator panel (demo scaffolding)
        this.simulatorUI.setStateLabel(core.state);
        this.simulatorUI.setProgress(core.trip === "none" ? "No trip" : progressLabel(core.trip), core.progress);
        if (vis.clarifyQuestion) {
            this.simulatorUI.showClarifyQuestion();
        } else {
            this.simulatorUI.hideClarifyQuestion();
        }
        const routeChoiceOk =
            (core.state === "Planning" && core.planningStep === "map") || core.state === "Stopped";
        this.simulatorUI.setRouteChoiceEnabled(routeChoiceOk);
        this.simulatorUI.setSampleTimeEnabled(this.canChangeSample(core));
        this.simulatorUI.setInputEnabled(inputOk);

        // Virtual table (a plain mesh, no scripts, so enabling it is safe)
        this.table.enabled = vis.table;

        // Map, routes and dots
        this.routeMap.applyView(mapViewFor(core));
        this.routeMap.setInputEnabled(inputOk);

        // Road view: the mock street with both routes laid on it
        this.roadView.applyView(roadViewFor(core));
        this.roadView.setInputEnabled(inputOk);
        if (!vis.road) {
            this.aimedRoute = "none";
            this.roadView.setExternalHover("none");
        }

        // Lens layer cards
        this.lensUI.setInputEnabled(inputOk);
        const times = core.departure && core.departure.minutes;
        const trip = core.trip;
        const canShowGraph = vis.departureCard && core.office !== "branch" && trip !== "none";
        if (!canShowGraph) {
            this.weekday = -1;
            this.departureGraphOpen = false;
        }
        const outlook = canShowGraph && this.departureGraphOpen
            ? weekdayTraffic(this.history, trip, this.weekday, this.planningMinute) : null;
        this.lensUI.setDeparture(vis.departureCard ? core.departure : null, outlook, this.weekday, canShowGraph);
        if (vis.labelA && core.trip !== "none") {
            const phase = core.state === "Stopped" ? "stopped" : "planning";
            const progress = core.state === "Stopped" ? core.progress : 0;
            const a = routeLabel(core.trip, phase, "A", progress, core.activeRoute, times);
            const b = routeLabel(core.trip, phase, "B", progress, core.activeRoute, times);
            this.lensUI.showRouteLabels(a, b);
            this.labelTextA = labelToText(a);
            this.labelTextB = labelToText(b);
        } else {
            this.lensUI.hideRouteLabels();
            this.labelTextA = "";
            this.labelTextB = "";
        }
        if (vis.problemCard && core.trip !== "none" && core.alertKind !== "none") {
            this.problemText = problemCardText(core.trip, core.progress, times);
            this.lensUI.showProblemCard(core.alertKind, this.problemText);
        } else {
            this.lensUI.hideProblemCard();
            this.problemText = "";
        }
        if (vis.progressCard && core.trip !== "none") {
            this.progressText = progressCardText(core.trip, core.activeRoute === "B" ? "B" : "A", core.progress, times);
            this.lensUI.showProgressCard(this.progressText);
        } else {
            this.lensUI.hideProgressCard();
            this.progressText = "";
        }
        if (vis.raincoatReminder) {
            this.lensUI.showRaincoatReminder();
        } else {
            this.lensUI.hideRaincoatReminder();
        }
        if (!vis.alertIcon) {
            this.alertActive = false;
            this.lensUI.hideAlertIcon();
        }

        this.logVisible(core);
    }

    // -------------------------------------------------------------- readback

    private readVisibility(core: StateCore): LensVisibility {
        const intended = visibilityFor(core);
        if (!this.started) {
            return intended;
        }
        const map = this.routeMap.getVisibility();
        const lens = this.lensUI.getVisibility();
        const road = this.roadView.getVisibility();
        return {
            departureCard: lens.departureCard,
            glanceStrip: !!this.glanceStrip && this.glanceStrip.isVisible(),
            table: this.table.isEnabledInHierarchy,
            progressMarks: map.progressMarks,
            progressCard: lens.progressCard,
            road: road.road,
            roadLineA: road.roadLineA,
            roadLineB: road.roadLineB,
            splitRing: road.splitRing,
            map: map.map,
            routeA: map.routeA,
            routeB: map.routeB,
            dotA: map.dotA,
            dotB: map.dotB,
            labelA: lens.labelA,
            labelB: lens.labelB,
            problemHighlight: map.problemHighlight,
            problemCard: lens.problemCard,
            raincoatReminder: lens.raincoatReminder,
            alertIcon: lens.alertIcon,
            clarifyQuestion: this.simulatorUI.isClarifyQuestionVisible(),
        };
    }

    private alertIconCameraLocal(): Vec3Like {
        if (!this.started || isNull(this.cameraObject) || !this.alertFollow) {
            return { x: 0, y: 0, z: 0 };
        }
        const iconPos = this.alertFollow.getSceneObject().getTransform().getWorldPosition();
        const local = this.cameraObject.getTransform().getInvertedWorldTransform().multiplyPoint(iconPos);
        return { x: local.x, y: local.y, z: local.z };
    }

    // ------------------------------------------------------------------ logs

    private logState(core: StateCore, force: boolean): void {
        const key =
            "state=" +
            core.state +
            " step=" +
            core.planningStep +
            " trip=" +
            core.trip +
            " progress=" +
            core.progress.toFixed(2) +
            " route=" +
            core.activeRoute +
            (core.confirmRoute !== "none" ? " confirming=" + core.confirmRoute : "");
        if (force || key !== this.lastStateKey) {
            this.lastStateKey = key;
            tiLog(key);
        }
    }

    private logVisible(core: StateCore): void {
        if (!this.verboseLogs) {
            return;
        }
        const v = this.readVisibility(core);
        const key =
            "visible table=" +
            v.table +
            " map=" +
            v.map +
            " dots=" +
            (v.dotA || v.dotB) +
            " labels=" +
            (v.labelA || v.labelB) +
            " problem=" +
            (v.problemCard || v.problemHighlight) +
            " progress=" +
            (v.progressMarks && v.progressCard) +
            " road=" +
            v.road +
            " raincoat=" +
            v.raincoatReminder +
            " alertIcon=" +
            v.alertIcon + " glance=" + v.glanceStrip;
        if (key !== this.lastVisibleKey) {
            this.lastVisibleKey = key;
            tiLog(key);
        }
    }

    // ---------------------------------------------------------------- guards

    private validateInputs(): boolean {
        const missing: string[] = [];
        if (!this.simulatorUI) missing.push("simulatorUI");
        if (!this.lensUI) missing.push("lensUI");
        if (!this.routeMap) missing.push("routeMap");
        if (!this.audio) missing.push("audio");
        if (!this.alertFollow) missing.push("alertFollow");
        if (!this.roadView) missing.push("roadView");
        if (!this.glanceStrip) missing.push("glanceStrip");
        if (isNull(this.cameraObject)) missing.push("cameraObject");
        if (isNull(this.table)) missing.push("table");
        if (missing.length > 0) {
            tiError("TrafficInsightMain: required @input not wired: " + missing.join(", ") + ". Check the bootstrap wiring.");
            return false;
        }
        if (this.rideStep <= 0) {
            tiWarn("rideStep must be > 0; using 0.05");
            this.rideStep = 0.05;
        }
        return true;
    }

    /** Toggle collider wireframes under obj (debugColliders). */
    private setColliderDebugAll(obj: SceneObject, enable: boolean): void {
        const c = obj.getComponent("Physics.ColliderComponent") as ColliderComponent;
        if (c) c.debugDrawEnabled = enable;
        const b = obj.getComponent("Physics.BodyComponent") as ColliderComponent;
        if (b) b.debugDrawEnabled = enable;
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            this.setColliderDebugAll(obj.getChild(i), enable);
        }
    }
}
