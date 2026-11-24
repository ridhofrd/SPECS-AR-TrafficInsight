/**
 * TrafficInsightRideSimulatorUI.ts
 *
 * Owns: the two DEMO-SCAFFOLDING surfaces that stand in for a real ride in the
 * Interactive Preview — the Ride simulator panel (state line, trip progress,
 * trip / ride / route-choice buttons, caption) and the clarify dialog
 * ("Which office?").
 * Inputs: rideSimulatorRoot, clarifyDialogRoot (scene-authored roots; resolved
 * by name when the inputs are unset).
 * Must not: hold domain state or decide meaning. It renders what Main pushes
 * and reports button presses as events. It never hides the dialog on its own.
 * Size reason: both surfaces share one button-gating table (the dialog blocks
 * the panel behind it), so splitting them would duplicate that state.
 */

import Event, {PublicApi} from "InteractionKit.lspkg/Utils/Event"
import {Button} from "UIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "UIKit.lspkg/Scripts/Components/Content/ElementContent"
import {RoundedRectangle} from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {CanvasController} from "UIKit.lspkg/Scripts/Utility/CanvasController"
import {FlexAlign, FlexJustify} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {
  obj,
  contentHost,
  flexColumn,
  flexRow,
  flexChild,
  dynamicText,
  contentOn,
  addButton,
  makeCardRect
} from "./UIKitHelpers"
import {tiLog, tiWarn, tiError, ROOT_NAMES, BUTTON_NAMES} from "./TrafficInsightSceneContracts"
import {RouteId} from "./TrafficInsightTypes"

// ─── Palette (additive display: mid-tone plates, bright text, no near-black) ─
// The demo rig is a neutral warm grey so it reads as different from the
// slate-blue Lens layer. Accents live in borders and the header text only.
const TEXT_PRIMARY = new vec4(1, 1, 1, 1)
const TEXT_SECONDARY = new vec4(0.88, 0.88, 0.88, 1)
const SIM_PLATE = new vec4(0.34, 0.34, 0.36, 0.88)
const SKY = new vec4(0.49, 0.78, 0.95, 1)
const AMBER = new vec4(1.0, 0.77, 0.42, 1)
const MINT = new vec4(0.56, 0.89, 0.72, 1)
const TRACK_COLOR = new vec4(0.82, 0.82, 0.84, 0.9)
/**
 * The theme's inactive label alpha is 0.35 (ContentInactiveWhite) and it has no
 * public setter. ElementContent's public opacity factor multiplies it, so 1.8
 * lifts a disabled label to about 0.63: dimmer than active, still readable.
 */
const INACTIVE_LABEL_OPACITY = 1.8

// ─── Plan sizes (cm, full extent) ───────────────────────────────────────────
const SIM_W = 34
const SIM_H = 45
const SIM_INNER_W = 31
const SIM_INNER_H = 42
const SIM_GAP = 0.8
const BTN_W = 14.5
const BTN_H = 4
const ROW_GAP = 1
const ROW_W = BTN_W * 2 + ROW_GAP

const DLG_W = 26
const DLG_H = 14
const DLG_INNER_W = 24
const DLG_INNER_H = 11
const DLG_BTN_W = 11.5
const DLG_BTN_H = 4
const DLG_ICON = 2.4

const BORDER_SIZE = 0.25
const CORNER_RADIUS = 1.2
const ROW_ICON = 1.8
const ROW_ICON_GAP = 0.6
const TRACK_H = 0.8
const CAPTION_H = 5.5
const CAPTION_PLACEHOLDER = "Captions appear here"

/** Which gate a button obeys besides the global input flag. */
type ButtonGroup = "trip" | "ride" | "route" | "dialog" | "glance" | "sample"

interface ButtonSlot {
  name: string
  group: ButtonGroup
  button: Button | null
  content: ElementContent | null
}

function clamp01(v: number): number {
  if (typeof v !== "number" || isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}

@component
export class TrafficInsightRideSimulatorUI extends BaseScriptComponent {
  @input
  @allowUndefined
  private rideSimulatorRoot: SceneObject

  @input
  @allowUndefined
  private clarifyDialogRoot: SceneObject

  // ─── Events ──────────────────────────────────────────────────────────────
  private readonly goToOfficeEvent = new Event<void>()
  public get onGoToOffice(): PublicApi<void> {
    return this.goToOfficeEvent.publicApi()
  }

  private readonly goHomeEvent = new Event<void>()
  public get onGoHome(): PublicApi<void> {
    return this.goHomeEvent.publicApi()
  }

  private readonly answerOfficeEvent = new Event<{office: "main" | "branch"}>()
  public get onAnswerOffice(): PublicApi<{office: "main" | "branch"}> {
    return this.answerOfficeEvent.publicApi()
  }

  private readonly rideEvent = new Event<void>()
  public get onRide(): PublicApi<void> {
    return this.rideEvent.publicApi()
  }

  private readonly stoppedEvent = new Event<void>()
  public get onStopped(): PublicApi<void> {
    return this.stoppedEvent.publicApi()
  }

  private readonly whereAmIEvent = new Event<void>()
  public get onWhereAmI(): PublicApi<void> {
    return this.whereAmIEvent.publicApi()
  }

  private readonly hideRouteEvent = new Event<void>()
  public get onHideRoute(): PublicApi<void> { return this.hideRouteEvent.publicApi() }
  private glanceVisible = false
  public setGlanceVisible(visible: boolean): void {
    if (this.glanceVisible === visible) return
    this.glanceVisible = visible
    this.applyButtonStates()
  }

  private readonly sampleTimeEvent = new Event<void>()
  public get onSampleTime(): PublicApi<void> { return this.sampleTimeEvent.publicApi() }
  private sampleEnabled = false
  private sampleRow: SceneObject | null = null
  public setSampleTimeEnabled(enabled: boolean): void {
    if (this.sampleEnabled === enabled) return
    this.sampleEnabled = enabled
    this.applyButtonStates()
  }

  private readonly chooseRouteEvent = new Event<{route: RouteId}>()
  public get onChooseRoute(): PublicApi<{route: RouteId}> {
    return this.chooseRouteEvent.publicApi()
  }

  /** Aiming at a "Choose route X" button (on) or moving off it (off). Lets the road stripe brighten too. */
  private readonly routeHoverEvent = new Event<{route: RouteId; on: boolean}>()
  public get onRouteHover(): PublicApi<{route: RouteId; on: boolean}> {
    return this.routeHoverEvent.publicApi()
  }

  // ─── Cached view state (safe from onAwake onward) ────────────────────────
  private stateName: string = "Planning"
  private tripLabel: string = ""
  private progressFraction: number = 0
  private caption: string = ""
  private clarifyVisible: boolean = false
  private inputEnabled: boolean = true
  private routeChoiceEnabled: boolean = true

  // ─── Visual refs (null until built) ──────────────────────────────────────
  private built: boolean = false
  private simPanel: SceneObject | null = null
  private dialogPanel: SceneObject | null = null
  private stateText: Text | null = null
  private progressText: Text | null = null
  private progressFill: RoundedRectangle | null = null
  private progressFillObj: SceneObject | null = null
  private arrivedFlag: ElementContent | null = null
  private captionText: Text | null = null
  private readonly slots: ButtonSlot[] = [
    {name: BUTTON_NAMES.sampleTime, group: "sample", button: null, content: null},
    {name: BUTTON_NAMES.goToOffice, group: "trip", button: null, content: null},
    {name: BUTTON_NAMES.goHome, group: "trip", button: null, content: null},
    {name: BUTTON_NAMES.ride, group: "ride", button: null, content: null},
    {name: BUTTON_NAMES.stopped, group: "ride", button: null, content: null},
    {name: BUTTON_NAMES.whereAmI, group: "ride", button: null, content: null},
    {name: BUTTON_NAMES.hideRoute, group: "glance", button: null, content: null},
    {name: BUTTON_NAMES.chooseRouteA, group: "route", button: null, content: null},
    {name: BUTTON_NAMES.chooseRouteB, group: "route", button: null, content: null},
    {name: BUTTON_NAMES.mainOffice, group: "dialog", button: null, content: null},
    {name: BUTTON_NAMES.branchOffice, group: "dialog", button: null, content: null}
  ]

  // ─── Public API ──────────────────────────────────────────────────────────

  public setStateLabel(stateName: string): void {
    this.stateName = stateName ?? ""
    this.applyStateLabel()
    this.applyArrivedFlag()
  }

  public setProgress(tripLabel: string, fraction: number): void {
    this.tripLabel = tripLabel ?? ""
    this.progressFraction = clamp01(fraction)
    this.applyProgress()
  }

  public setCaption(text: string): void {
    this.caption = text ?? ""
    this.applyCaption()
  }

  public getCaption(): string {
    return this.caption
  }

  public showClarifyQuestion(): void {
    this.clarifyVisible = true
    this.applyDialogVisibility()
    this.applyButtonStates()
  }

  public hideClarifyQuestion(): void {
    this.clarifyVisible = false
    this.applyDialogVisibility()
    this.applyButtonStates()
  }

  public isClarifyQuestionVisible(): boolean {
    return this.clarifyVisible
  }

  public setRouteChoiceEnabled(enabled: boolean): void {
    this.routeChoiceEnabled = !!enabled
    this.applyButtonStates()
  }

  public setInputEnabled(enabled: boolean): void {
    this.inputEnabled = !!enabled
    this.applyButtonStates()
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  onAwake(): void {
    // UIKit / IK subscriptions (onTriggerUp) must happen in OnStart, so the tree is built there.
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  private onStart(): void {
    if (this.built) return
    try {
      this.build()
    } catch (e) {
      tiError("TrafficInsightRideSimulatorUI: build failed: " + e)
    }
    this.built = true
    this.applyAll()
    tiLog("ui simulator ready")
  }

  // ─── Build ───────────────────────────────────────────────────────────────

  private build(): void {
    const icons: SimIcons = {
      work: this.loadIcon("work", () => requireAsset("../Icons/work.png") as Texture),
      home: this.loadIcon("home", () => requireAsset("../Icons/home_hexfafafa.png") as Texture),
      ride: this.loadIcon("two_wheeler", () => requireAsset("../Icons/two_wheeler.png") as Texture),
      park: this.loadIcon("local_parking", () => requireAsset("../Icons/local_parking.png") as Texture),
      route: this.loadIcon("alt_route", () => requireAsset("../Icons/alt_route.png") as Texture),
      flag: this.loadIcon("flag", () => requireAsset("../Icons/flag.png") as Texture),
      caption: this.loadIcon("closed_caption", () => requireAsset("../Icons/closed_caption.png") as Texture)
    }
    const mainIcon = this.loadIcon("apartment", () => requireAsset("../Icons/apartment.png") as Texture)
    const branchIcon = this.loadIcon("store", () => requireAsset("../Icons/store_hexfafafa.png") as Texture)
    const helpIcon = this.loadIcon("help", () => requireAsset("../Icons/help.png") as Texture)

    const simRoot = this.resolveRoot(this.rideSimulatorRoot, ROOT_NAMES.rideSimulatorRoot)
    if (simRoot) {
      this.buildSimulator(simRoot, icons)
    } else {
      tiError("TrafficInsightRideSimulatorUI: " + ROOT_NAMES.rideSimulatorRoot + " not found")
    }

    const dlgRoot = this.resolveRoot(this.clarifyDialogRoot, ROOT_NAMES.clarifyDialogRoot)
    if (dlgRoot) {
      this.buildDialog(dlgRoot, mainIcon, branchIcon, helpIcon)
    } else {
      tiError("TrafficInsightRideSimulatorUI: " + ROOT_NAMES.clarifyDialogRoot + " not found")
    }
  }

  private buildSimulator(root: SceneObject, icons: SimIcons): void {
    const panel = this.adoptPanel(root)
    this.simPanel = panel
    new CanvasController(panel).ensure(new vec2(SIM_W, SIM_H))

    // Backing plate first, content after it (Canvas Hierarchy sort paints content on top).
    const backing = obj(panel, "Backing")
    const card = makeCardRect(backing, SIM_W, SIM_H, {
      color: SIM_PLATE,
      border: true,
      cornerRadius: CORNER_RADIUS
    }) as RoundedRectangle
    card.borderColor = AMBER
    card.borderSize = BORDER_SIZE

    const content = contentHost(panel)
    const column = flexColumn(content, SIM_INNER_W, SIM_INNER_H, {
      gap: SIM_GAP,
      padX: 0,
      padY: 0,
      justify: FlexJustify.Center,
      align: FlexAlign.Center
    })

    // 1. Header (amber on the grey plate)
    const header = dynamicText(column, "Ride simulator (preview only)", "Headline2", SIM_INNER_W, 3, AMBER)
    header.horizontalOverflow = HorizontalOverflow.Shrink

    // 2. State line
    this.stateText = dynamicText(column, "State: " + this.stateName, "Body", ROW_W, 2.2, TEXT_PRIMARY)
    this.stateText.horizontalOverflow = HorizontalOverflow.Shrink

    // 3. Progress label, with the flag icon shown once the trip has arrived
    const progressRow = flexRow(column, ROW_W, 2, {
      gap: ROW_ICON_GAP,
      justify: FlexJustify.Center,
      align: FlexAlign.Center
    })
    flexChild(progressRow, {w: ROW_ICON, h: ROW_ICON}, (cell) => {
      const ec = contentOn(cell, "", "Body", ROW_ICON, ROW_ICON, "center", icons.flag)
      ec.leadingIconSize = ROW_ICON * 0.9
      ec.opacity = 0
      this.arrivedFlag = ec
    })
    this.progressText = dynamicText(
      progressRow,
      "No trip: 0%",
      "Caption",
      ROW_W - (ROW_ICON + ROW_ICON_GAP) * 2,
      2,
      TEXT_SECONDARY
    )
    this.progressText.horizontalOverflow = HorizontalOverflow.Shrink
    // Mirror cell so the label stays centred on the panel.
    flexChild(progressRow, {w: ROW_ICON, h: ROW_ICON}, () => {})

    // 4. Progress track: two UIKit RoundedRectangles (light track, mint fill).
    //    UIKit's ProgressBar has no public track colour, and its theme track is
    //    dark grey, which vanishes on the additive display.
    flexChild(column, {w: ROW_W, h: 1}, (cell) => {
      const trackObj = obj(cell, "ProgressTrack")
      const track = trackObj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
      track.size = new vec2(ROW_W, TRACK_H)
      track.cornerRadius = TRACK_H / 2
      track.gradient = false
      track.border = false
      track.backgroundColor = TRACK_COLOR

      const fillObj = obj(cell, "ProgressFill", new vec3(0, 0, 0.05))
      const fill = fillObj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
      fill.size = new vec2(ROW_W, TRACK_H)
      fill.cornerRadius = TRACK_H / 2
      fill.gradient = false
      fill.border = false
      fill.backgroundColor = MINT
      this.progressFill = fill
      this.progressFillObj = fillObj
    })

    // 5. Trip buttons
    const tripRow = flexRow(column, ROW_W, BTN_H, {gap: ROW_GAP, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(tripRow, BUTTON_NAMES.goToOffice, "Go to office", BTN_W, BTN_H, icons.work, () =>
      this.goToOfficeEvent.invoke()
    )
    this.makeButton(tripRow, BUTTON_NAMES.goHome, "Go home", BTN_W, BTN_H, icons.home, () =>
      this.goHomeEvent.invoke()
    )

    // 6. Ride buttons
    const rideRow = flexRow(column, ROW_W, BTN_H, {gap: ROW_GAP, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(rideRow, BUTTON_NAMES.ride, "Ride", BTN_W, BTN_H, icons.ride, () => this.rideEvent.invoke())
    this.makeButton(rideRow, BUTTON_NAMES.stopped, "I've stopped", BTN_W, BTN_H, icons.park, () =>
      this.stoppedEvent.invoke()
    )

    // 7. Route choice buttons
    const routeRow = flexRow(column, ROW_W, BTN_H, {gap: ROW_GAP, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(
      routeRow,
      BUTTON_NAMES.chooseRouteA,
      "Choose route A",
      BTN_W,
      BTN_H,
      icons.route,
      () => this.chooseRouteEvent.invoke({route: "A"}),
      (on) => this.routeHoverEvent.invoke({route: "A", on: on})
    )
    this.makeButton(
      routeRow,
      BUTTON_NAMES.chooseRouteB,
      "Choose route B",
      BTN_W,
      BTN_H,
      icons.route,
      () => this.chooseRouteEvent.invoke({route: "B"}),
      (on) => this.routeHoverEvent.invoke({route: "B", on: on})
    )

    // Requested voice answer: simulator stand-in only, never a rider hand gesture.
    const askRow = flexRow(column, ROW_W, BTN_H, {gap: ROW_GAP, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(askRow, BUTTON_NAMES.whereAmI, "Where am I?", BTN_W, BTN_H, undefined, () => this.whereAmIEvent.invoke())
    this.makeButton(askRow, BUTTON_NAMES.hideRoute, "Hide route", BTN_W, BTN_H, undefined, () => this.hideRouteEvent.invoke())

    this.sampleRow = flexRow(column, ROW_W, BTN_H, {justify: FlexJustify.Center})
    this.makeButton(this.sampleRow, BUTTON_NAMES.sampleTime, "Change sample time", ROW_W, BTN_H,
      undefined, () => this.sampleTimeEvent.invoke())

    // 8. Caption (wrapped) beside the closed-caption icon
    const captionRow = flexRow(column, ROW_W, CAPTION_H, {
      gap: ROW_ICON_GAP,
      justify: FlexJustify.Start,
      align: FlexAlign.Center
    })
    flexChild(captionRow, {w: ROW_ICON, h: ROW_ICON}, (cell) => {
      const ec = contentOn(cell, "", "Body", ROW_ICON, ROW_ICON, "center", icons.caption)
      ec.leadingIconSize = ROW_ICON * 0.9
    })
    this.captionText = dynamicText(
      captionRow,
      CAPTION_PLACEHOLDER,
      "Body",
      ROW_W - ROW_ICON - ROW_ICON_GAP,
      CAPTION_H,
      TEXT_SECONDARY
    )
    this.captionText.horizontalAlignment = HorizontalAlignment.Left
    this.captionText.horizontalOverflow = HorizontalOverflow.Wrap
    this.captionText.verticalOverflow = VerticalOverflow.Shrink
  }

  private buildDialog(
    root: SceneObject,
    mainIcon: Texture | undefined,
    branchIcon: Texture | undefined,
    helpIcon: Texture | undefined
  ): void {
    const panel = this.adoptPanel(root)
    this.dialogPanel = panel
    new CanvasController(panel).ensure(new vec2(DLG_W, DLG_H))

    const backing = obj(panel, "Backing")
    const card = makeCardRect(backing, DLG_W, DLG_H, {
      color: SIM_PLATE,
      border: true,
      cornerRadius: CORNER_RADIUS
    }) as RoundedRectangle
    card.borderColor = SKY
    card.borderSize = BORDER_SIZE

    const content = contentHost(panel)
    const column = flexColumn(content, DLG_INNER_W, DLG_INNER_H, {
      gap: 1,
      padX: 0,
      padY: 0,
      justify: FlexJustify.Center,
      align: FlexAlign.Center
    })

    // Question header: help icon + wrapped question.
    const questionRow = flexRow(column, DLG_INNER_W, 4, {
      gap: ROW_ICON_GAP,
      justify: FlexJustify.Center,
      align: FlexAlign.Center
    })
    flexChild(questionRow, {w: DLG_ICON, h: DLG_ICON}, (cell) => {
      const ec = contentOn(cell, "", "Body", DLG_ICON, DLG_ICON, "center", helpIcon)
      ec.leadingIconSize = DLG_ICON * 0.9
    })
    const question = dynamicText(
      questionRow,
      "Which office: Main office or Branch office?",
      "Body",
      DLG_INNER_W - DLG_ICON - ROW_ICON_GAP,
      4,
      TEXT_PRIMARY
    )
    question.horizontalAlignment = HorizontalAlignment.Left
    question.horizontalOverflow = HorizontalOverflow.Wrap
    question.verticalOverflow = VerticalOverflow.Shrink

    const answerRow = flexRow(column, DLG_BTN_W * 2 + 1, DLG_BTN_H, {
      gap: 1,
      justify: FlexJustify.Center,
      align: FlexAlign.Center
    })
    this.makeButton(answerRow, BUTTON_NAMES.mainOffice, "Main office", DLG_BTN_W, DLG_BTN_H, mainIcon, () =>
      this.answerOfficeEvent.invoke({office: "main"})
    )
    this.makeButton(answerRow, BUTTON_NAMES.branchOffice, "Branch office", DLG_BTN_W, DLG_BTN_H, branchIcon, () =>
      this.answerOfficeEvent.invoke({office: "branch"})
    )
  }

  /**
   * Every button is System3 "Secondary": a transparent face with a light border
   * and light label. "Primary" fills with a dark gradient, which disappears on
   * the additive display.
   */
  private makeButton(
    row: SceneObject,
    name: string,
    label: string,
    w: number,
    h: number,
    icon: Texture | undefined,
    fire: () => void,
    hover?: (on: boolean) => void
  ): void {
    const r = addButton(row, label, w, h, () => this.press(name, fire), {
      variant: {shape: "Rectangle", style: "Secondary"},
      leadingIcon: icon
    })
    r.button.getSceneObject().name = name
    if (hover) {
      r.button.onHoverEnter.add(() => hover(true))
      r.button.onHoverExit.add(() => hover(false))
    }
    for (const slot of this.slots) {
      if (slot.name === name) {
        slot.button = r.button
        slot.content = r.content
      }
    }
  }

  private press(name: string, fire: () => void): void {
    tiLog("ui press=" + name)
    fire()
  }

  // ─── Apply cached state to visuals ───────────────────────────────────────

  private applyAll(): void {
    this.applyStateLabel()
    this.applyProgress()
    this.applyCaption()
    this.applyDialogVisibility()
    this.applyButtonStates()
    if (this.simPanel && !isNull(this.simPanel)) this.simPanel.enabled = true
  }

  private applyStateLabel(): void {
    if (this.stateText && !isNull(this.stateText)) {
      this.stateText.text = "State: " + this.stateName
    }
  }

  private applyProgress(): void {
    const label = this.tripLabel.length > 0 ? this.tripLabel : "No trip"
    const pct = Math.round(this.progressFraction * 100)
    if (this.progressText && !isNull(this.progressText)) {
      this.progressText.text = label + ": " + pct + "%"
    }
    if (this.progressFill && !isNull(this.progressFill) && this.progressFillObj && !isNull(this.progressFillObj)) {
      const w = ROW_W * this.progressFraction
      this.progressFillObj.enabled = w > 0.01
      if (w > 0.01) {
        this.progressFill.size = new vec2(w, TRACK_H)
        this.progressFill.cornerRadius = Math.min(TRACK_H / 2, w / 2)
        this.progressFillObj.getTransform().setLocalPosition(new vec3(-ROW_W / 2 + w / 2, 0, 0.05))
      }
    }
    this.applyArrivedFlag()
  }

  /** Flag icon beside the progress label once the trip has arrived. */
  private applyArrivedFlag(): void {
    if (!this.arrivedFlag || isNull(this.arrivedFlag)) return
    const arrived = this.stateName === "Arrived" || this.progressFraction >= 0.999
    this.arrivedFlag.opacity = arrived ? 1 : 0
  }

  private applyCaption(): void {
    if (!this.captionText || isNull(this.captionText)) return
    if (this.caption.length > 0) {
      this.captionText.text = this.caption
      this.captionText.textFill.color = TEXT_PRIMARY
    } else {
      this.captionText.text = CAPTION_PLACEHOLDER
      this.captionText.textFill.color = TEXT_SECONDARY
    }
  }

  private applyDialogVisibility(): void {
    if (this.dialogPanel && !isNull(this.dialogPanel)) {
      this.dialogPanel.enabled = this.clarifyVisible
    }
  }

  private applyButtonStates(): void {
    // Controls behind a visible dialog go inactive (UIKit has no modal dialog component).
    if (this.sampleRow) this.sampleRow.enabled = this.sampleEnabled
    const dialogBlocks = this.clarifyVisible && this.dialogPanel !== null
    for (const slot of this.slots) {
      if (!slot.button || isNull(slot.button)) continue
      const rowFlag = slot.group === "route" ? this.routeChoiceEnabled : slot.group === "glance" ? this.glanceVisible : slot.group === "sample" ? this.sampleEnabled : true
      const notBlocked = !dialogBlocks || slot.group === "dialog"
      const inactive = !(this.inputEnabled && rowFlag && notBlocked)
      slot.button.inactive = inactive
      if (slot.content && !isNull(slot.content)) {
        slot.content.opacity = inactive ? INACTIVE_LABEL_OPACITY : 1
      }
    }
  }

  // ─── Scene resolution ────────────────────────────────────────────────────

  private resolveRoot(input: SceneObject | undefined, name: string): SceneObject | null {
    if (input && !isNull(input)) return input
    const own = this.getSceneObject()
    if (own && own.name === name) return own
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count; i++) {
      const found = this.findByName(global.scene.getRootObject(i), name)
      if (found) return found
    }
    return null
  }

  private findByName(node: SceneObject, name: string): SceneObject | null {
    if (!node || isNull(node)) return null
    if (node.name === name) return node
    const n = node.getChildrenCount()
    for (let i = 0; i < n; i++) {
      const found = this.findByName(node.getChild(i), name)
      if (found) return found
    }
    return null
  }

  private adoptPanel(root: SceneObject): SceneObject {
    const n = root.getChildrenCount()
    for (let i = 0; i < n; i++) {
      const child = root.getChild(i)
      if (child.name === "Panel") return child
    }
    return obj(root, "Panel")
  }

  private readonly textOnlyFallbacks: string[] = []

  private loadIcon(label: string, load: () => Texture): Texture | undefined {
    try {
      const tex = load()
      if (tex) return tex
    } catch (e) {
      // fall through to text-only
    }
    this.textOnlyFallbacks.push(label)
    tiWarn("TrafficInsightRideSimulatorUI: icon " + label + " missing, using text only")
    return undefined
  }
}

/** Icons used on the simulator panel (undefined = text-only fallback). */
interface SimIcons {
  work: Texture | undefined
  home: Texture | undefined
  ride: Texture | undefined
  park: Texture | undefined
  route: Texture | undefined
  flag: Texture | undefined
  caption: Texture | undefined
}
