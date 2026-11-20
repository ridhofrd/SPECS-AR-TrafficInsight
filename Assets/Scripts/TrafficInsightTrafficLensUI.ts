/**
 * TrafficInsightTrafficLensUI.ts
 *
 * Owns: the LENS layer the rider sees on the glasses — two route label cards,
 * the problem card, the progress card ("Ridden 12 of 34 min"), the raincoat
 * reminder (Proceed / Raincoat on) and the head-locked alert icon. Passive view: it renders what Main pushes and
 * reports button presses as events; it holds no domain state.
 * Inputs: six scene-authored roots (optional @input, name fallback via
 * ROOT_NAMES). Attach to RouteLabelCardARoot.
 * Must not: decide what a press means, hide the reminder on press, move
 * AlertIconRoot (TrafficInsightLazyFollow owns its pose), or disable a root.
 * Size reason: one passive view over six small Lens surfaces that share the
 * same palette, icon set and input gate; splitting would only duplicate them.
 */

import Event, {PublicApi} from "InteractionKit.lspkg/Utils/Event"
import {Button} from "UIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "UIKit.lspkg/Scripts/Components/Content/ElementContent"
import {RoundedRectangle} from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {CanvasController} from "UIKit.lspkg/Scripts/Utility/CanvasController"
import {FlexJustify, FlexAlign} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {
    obj,
    contentHost,
    flexColumn,
    flexRow,
    flexChild,
    dynamicText,
    contentOn,
    addButton,
    makeCardRect,
} from "./UIKitHelpers"
import {tiLog, tiWarn, tiError, ROOT_NAMES, BUTTON_NAMES} from "./TrafficInsightSceneContracts"
import {ProblemKind, RouteLabelData} from "./TrafficInsightTypes"
import {CAPTIONS, labelToText} from "./TrafficInsightTripData"

// ─── Palette (additive display: mid-tone plates, bright text, no near-black) ─
// Lens-layer cards are a calm slate blue. Accents (mint recommended, coral
// crash, amber rain) live in borders, icons and title text, never the plate.
const TEXT_PRIMARY = new vec4(1, 1, 1, 1)
const TEXT_SECONDARY = new vec4(0.88, 0.9, 0.93, 1)
const SLATE_PLATE = new vec4(0.26, 0.36, 0.5, 0.88)
const SKY = new vec4(0.15, 0.72, 1, 1)
const MINT = new vec4(0.2, 1, 0.45, 1)
const AMBER = new vec4(1.0, 0.77, 0.42, 1)
const CORAL = new vec4(1.0, 0.62, 0.54, 1)
/** Lifts the theme's 0.35 inactive label alpha to about 0.63 (public opacity factor). */
const INACTIVE_LABEL_OPACITY = 1.8

// ─── Sizes (cm) ────────────────────────────────────────────────────────────
const LABEL_W = 14
const LABEL_H = 9
const LABEL_INNER_W = 12.6
const LABEL_INNER_H = 7.8
const LABEL_GAP = 0.3
const LABEL_STAR = 1.8
const LABEL_TITLE_GAP = 0.4
const LABEL_TITLE_W = LABEL_INNER_W - LABEL_STAR - LABEL_TITLE_GAP
const LABEL_LINE_H = 1.6
const LABEL_ROW_ICON = 1.4
const LABEL_ROW_GAP = 0.4
const LABEL_ROW_TEXT_W = LABEL_INNER_W - LABEL_ROW_ICON - LABEL_ROW_GAP

const PROBLEM_W = 16
const PROBLEM_H = 7.6
const PROBLEM_INNER_W = 14.6
const PROBLEM_INNER_H = 6.2
const PROBLEM_HEADER_H = 1.6
const PROBLEM_HEADER_ICON = 1.6
const PROBLEM_BODY_H = 4.2
const PROBLEM_GAP = 0.6
const PROBLEM_ICON = 3
const PROBLEM_TEXT_W = 11

const REMINDER_W = 20
const REMINDER_H = 7.4
const REMINDER_INNER_W = 18.8
const REMINDER_INNER_H = 6.4
const REMINDER_COL_GAP = 0.6
const REMINDER_ICON = 2.4
const REMINDER_TEXT_W = 15
const REMINDER_MSG_ROW_H = 2.8
const REMINDER_BTN_W = 9
const REMINDER_BTN_H = 2.8
const REMINDER_BTN_GAP = 0.8
const REMINDER_TEXT = CAPTIONS.raincoatPrompt

const PROGRESS_W = 15
const PROGRESS_H = 4.2
const PROGRESS_INNER_W = 13.8
const PROGRESS_INNER_H = 3
const PROGRESS_ICON = 2.2
const PROGRESS_GAP = 0.6
const PROGRESS_TEXT_W = PROGRESS_INNER_W - PROGRESS_ICON - PROGRESS_GAP
/** The "you are here" accent, the same yellow as the marker on the map. */
const YOU_ARE_HERE = new vec4(1.0, 0.93, 0.2, 1)

const ALERT_SIZE = 4
const ALERT_ICON_SIZE = 3.6

const CARD_CORNER = 1
const CARD_BORDER = 0.2

/** Visuals of one route label card. */
interface LabelVisuals {
    title: Text | null
    time: Text | null
    fuel: Text | null
    weather: Text | null
    weatherIcon: ElementContent | null
    star: ElementContent | null
}

@component
export class TrafficInsightTrafficLensUI extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("RouteLabelCardARoot (falls back to a name search)")
    private routeLabelCardARoot: SceneObject

    @input
    @allowUndefined
    @hint("RouteLabelCardBRoot (falls back to a name search)")
    private routeLabelCardBRoot: SceneObject

    @input
    @allowUndefined
    @hint("ProblemCardRoot (falls back to a name search)")
    private problemCardRoot: SceneObject

    @input
    @allowUndefined
    @hint("ProgressCardRoot (falls back to a name search)")
    private progressCardRoot: SceneObject

    @input
    @allowUndefined
    @hint("RaincoatReminderRoot (falls back to a name search)")
    private raincoatReminderRoot: SceneObject

    @input
    @allowUndefined
    @hint("AlertIconRoot (falls back to a name search); TrafficInsightLazyFollow moves it")
    private alertIconRoot: SceneObject

    // ─── Events ────────────────────────────────────────────────────────────
    private readonly proceedEvent = new Event<void>()
    private readonly raincoatOnEvent = new Event<void>()

    public get onProceed(): PublicApi<void> {
        return this.proceedEvent.publicApi()
    }

    public get onRaincoatOn(): PublicApi<void> {
        return this.raincoatOnEvent.publicApi()
    }

    // ─── Cached pushed state (valid from onAwake, before the build) ────────
    private visLabelA = false
    private visLabelB = false
    private visProblemCard = false
    private visProgressCard = false
    private visRaincoatReminder = false
    private visAlertIcon = false

    private labelDataA: RouteLabelData | null = null
    private labelDataB: RouteLabelData | null = null
    private labelTextA = ""
    private labelTextB = ""
    private problemKind: ProblemKind = "crash"
    private problemText = ""
    private progressText = ""
    private alertKind: ProblemKind = "crash"
    private alertOpacity = 1
    private inputEnabled = true

    // ─── Visual refs (null until built) ────────────────────────────────────
    private built = false
    private panelLabelA: SceneObject | null = null
    private panelLabelB: SceneObject | null = null
    private panelProblem: SceneObject | null = null
    private panelProgress: SceneObject | null = null
    private panelReminder: SceneObject | null = null
    private panelAlert: SceneObject | null = null
    private readonly canvases: CanvasController[] = []

    private labelA: LabelVisuals = {title: null, time: null, fuel: null, weather: null, weatherIcon: null, star: null}
    private labelB: LabelVisuals = {title: null, time: null, fuel: null, weather: null, weatherIcon: null, star: null}
    private problemCard: RoundedRectangle | null = null
    private problemIcon: ElementContent | null = null
    private problemHeader: Text | null = null
    private problemTextComp: Text | null = null
    private progressTextComp: Text | null = null
    private alertIcon: ElementContent | null = null
    private proceedButton: Button | null = null
    private raincoatOnButton: Button | null = null
    private proceedContent: ElementContent | null = null
    private raincoatOnContent: ElementContent | null = null

    // ─── Textures (loaded in onAwake) ──────────────────────────────────────
    private texCrash: Texture | undefined = undefined
    private texRain: Texture | undefined = undefined
    private texStar: Texture | undefined = undefined
    private texArrow: Texture | undefined = undefined
    private texSchedule: Texture | undefined = undefined
    private texFuel: Texture | undefined = undefined
    private texWeather: Texture | undefined = undefined
    private texWarning: Texture | undefined = undefined

    onAwake(): void {
        this.loadIcons()
        this.createEvent("OnStartEvent").bind(() => this.build())
    }

    // ─── Public API ────────────────────────────────────────────────────────

    public showRouteLabels(a: RouteLabelData, b: RouteLabelData): void {
        this.labelDataA = a
        this.labelDataB = b
        this.labelTextA = a ? labelToText(a) : ""
        this.labelTextB = b ? labelToText(b) : ""
        this.applyLabel(this.labelA, a)
        this.applyLabel(this.labelB, b)
        this.setLabelA(true)
        this.setLabelB(true)
    }

    public hideRouteLabels(): void {
        this.setLabelA(false)
        this.setLabelB(false)
    }

    public showProblemCard(kind: ProblemKind, text: string): void {
        this.problemKind = kind === "rain" ? "rain" : "crash"
        this.problemText = text ?? ""
        this.applyProblem()
        this.setProblemCard(true)
    }

    public hideProblemCard(): void {
        this.setProblemCard(false)
    }

    public showProgressCard(text: string): void {
        this.progressText = text ?? ""
        this.applyProgress()
        this.setProgressCard(true)
    }

    public hideProgressCard(): void {
        this.setProgressCard(false)
    }

    public showRaincoatReminder(): void {
        this.setRaincoatReminder(true)
    }

    public hideRaincoatReminder(): void {
        this.setRaincoatReminder(false)
    }

    public showAlertIcon(kind: ProblemKind): void {
        this.alertKind = kind === "rain" ? "rain" : "crash"
        this.alertOpacity = 1
        this.applyAlert()
        this.setAlertIcon(true)
    }

    public setAlertIconOpacity(alpha: number): void {
        const a = typeof alpha === "number" && isFinite(alpha) ? alpha : 0
        this.alertOpacity = Math.min(1, Math.max(0, a))
        if (this.alertIcon && !isNull(this.alertIcon)) {
            this.alertIcon.opacity = this.alertOpacity
        }
    }

    public hideAlertIcon(): void {
        this.setAlertIcon(false)
    }

    public hideAll(): void {
        this.setLabelA(false)
        this.setLabelB(false)
        this.setProblemCard(false)
        this.setProgressCard(false)
        this.setRaincoatReminder(false)
        this.setAlertIcon(false)
    }

    public getVisibility(): {
        labelA: boolean
        labelB: boolean
        problemCard: boolean
        progressCard: boolean
        raincoatReminder: boolean
        alertIcon: boolean
    } {
        return {
            labelA: this.visLabelA,
            labelB: this.visLabelB,
            problemCard: this.visProblemCard,
            progressCard: this.visProgressCard,
            raincoatReminder: this.visRaincoatReminder,
            alertIcon: this.visAlertIcon,
        }
    }

    public getTexts(): {labelA: string; labelB: string; problemCard: string; progressCard: string} {
        return {
            labelA: this.labelTextA,
            labelB: this.labelTextB,
            problemCard: this.problemText,
            progressCard: this.progressText,
        }
    }

    public setInputEnabled(enabled: boolean): void {
        this.inputEnabled = !!enabled
        this.applyInputEnabled()
    }

    // ─── Visibility flags (log only on change) ─────────────────────────────

    private setLabelA(v: boolean): void {
        if (this.visLabelA !== v) {
            this.visLabelA = v
            tiLog("ui lens labelA=" + v)
        }
        this.showPanel(this.panelLabelA, v)
    }

    private setLabelB(v: boolean): void {
        if (this.visLabelB !== v) {
            this.visLabelB = v
            tiLog("ui lens labelB=" + v)
        }
        this.showPanel(this.panelLabelB, v)
    }

    private setProblemCard(v: boolean): void {
        if (this.visProblemCard !== v) {
            this.visProblemCard = v
            tiLog("ui lens problemCard=" + v)
        }
        this.showPanel(this.panelProblem, v)
    }

    private setProgressCard(v: boolean): void {
        if (this.visProgressCard !== v) {
            this.visProgressCard = v
            tiLog("ui lens progressCard=" + v)
        }
        this.showPanel(this.panelProgress, v)
    }

    private setRaincoatReminder(v: boolean): void {
        if (this.visRaincoatReminder !== v) {
            this.visRaincoatReminder = v
            tiLog("ui lens raincoatReminder=" + v)
        }
        this.showPanel(this.panelReminder, v)
    }

    private setAlertIcon(v: boolean): void {
        if (this.visAlertIcon !== v) {
            this.visAlertIcon = v
            tiLog("ui lens alertIcon=" + v)
        }
        this.showPanel(this.panelAlert, v)
    }

    private showPanel(panel: SceneObject | null, v: boolean): void {
        if (panel && !isNull(panel)) {
            panel.enabled = v
        }
    }

    // ─── Apply cached state to visuals (null-safe, never throws) ───────────

    private applyAll(): void {
        if (this.labelDataA) this.applyLabel(this.labelA, this.labelDataA)
        if (this.labelDataB) this.applyLabel(this.labelB, this.labelDataB)
        this.applyProblem()
        this.applyProgress()
        this.applyAlert()
        this.applyInputEnabled()
        this.showPanel(this.panelLabelA, this.visLabelA)
        this.showPanel(this.panelLabelB, this.visLabelB)
        this.showPanel(this.panelProblem, this.visProblemCard)
        this.showPanel(this.panelProgress, this.visProgressCard)
        this.showPanel(this.panelReminder, this.visRaincoatReminder)
        this.showPanel(this.panelAlert, this.visAlertIcon)
    }

    private applyLabel(v: LabelVisuals, data: RouteLabelData | null): void {
        if (!data) return
        if (v.title && !isNull(v.title)) {
            v.title.text = data.title ?? ""
            v.title.textFill.color = data.route === "A" ? SKY : MINT
        }
        if (v.time && !isNull(v.time)) v.time.text = data.time ?? ""
        if (v.fuel && !isNull(v.fuel)) v.fuel.text = data.fuel ?? ""
        if (v.weather && !isNull(v.weather)) {
            v.weather.text = data.weather ?? ""
            v.weather.textFill.color = data.weatherKind === "rain" ? AMBER : TEXT_SECONDARY
        }
        if (v.weatherIcon && !isNull(v.weatherIcon)) {
            v.weatherIcon.leadingIcon = data.weatherKind === "rain" ? this.texRain : this.texWeather
        }
        if (v.star && !isNull(v.star)) v.star.opacity = data.recommended ? 1 : 0
    }

    private applyProblem(): void {
        const hue = this.problemKind === "rain" ? AMBER : CORAL
        if (this.problemCard && !isNull(this.problemCard)) {
            // Plate stays slate; the kind hue is the border and header text.
            this.problemCard.backgroundColor = SLATE_PLATE
            this.problemCard.borderColor = hue
        }
        if (this.problemHeader && !isNull(this.problemHeader)) {
            this.problemHeader.text = this.problemKind === "rain" ? "Rain on your route" : "Crash on your route"
            this.problemHeader.textFill.color = hue
        }
        if (this.problemIcon && !isNull(this.problemIcon)) {
            const tex = this.problemKind === "rain" ? this.texRain : this.texCrash
            if (tex) this.problemIcon.leadingIcon = tex
        }
        if (this.problemTextComp && !isNull(this.problemTextComp)) {
            this.problemTextComp.text = this.problemText
        }
    }

    private applyProgress(): void {
        if (this.progressTextComp && !isNull(this.progressTextComp)) {
            this.progressTextComp.text = this.progressText
        }
    }

    private applyAlert(): void {
        if (!this.alertIcon || isNull(this.alertIcon)) return
        const tex = this.alertKind === "rain" ? this.texRain : this.texCrash
        if (tex) {
            this.alertIcon.leadingIcon = tex
        }
        this.alertIcon.opacity = this.alertOpacity
    }

    private applyInputEnabled(): void {
        const labelOpacity = this.inputEnabled ? 1 : INACTIVE_LABEL_OPACITY
        if (this.proceedButton && !isNull(this.proceedButton)) {
            this.proceedButton.inactive = !this.inputEnabled
        }
        if (this.proceedContent && !isNull(this.proceedContent)) {
            this.proceedContent.opacity = labelOpacity
        }
        if (this.raincoatOnButton && !isNull(this.raincoatOnButton)) {
            this.raincoatOnButton.inactive = !this.inputEnabled
        }
        if (this.raincoatOnContent && !isNull(this.raincoatOnContent)) {
            this.raincoatOnContent.opacity = labelOpacity
        }
    }

    // ─── Presses ───────────────────────────────────────────────────────────

    private pressProceed(): void {
        tiLog("ui press=" + BUTTON_NAMES.proceed)
        this.proceedEvent.invoke()
    }

    private pressRaincoatOn(): void {
        tiLog("ui press=" + BUTTON_NAMES.raincoatOn)
        this.raincoatOnEvent.invoke()
    }

    // ─── Build (OnStartEvent) ──────────────────────────────────────────────

    private build(): void {
        if (this.built) return
        this.built = true

        const rootA = this.resolveRoot(this.routeLabelCardARoot, ROOT_NAMES.routeLabelCardARoot)
        const rootB = this.resolveRoot(this.routeLabelCardBRoot, ROOT_NAMES.routeLabelCardBRoot)
        const rootProblem = this.resolveRoot(this.problemCardRoot, ROOT_NAMES.problemCardRoot)
        const rootProgress = this.resolveRoot(this.progressCardRoot, ROOT_NAMES.progressCardRoot)
        const rootReminder = this.resolveRoot(this.raincoatReminderRoot, ROOT_NAMES.raincoatReminderRoot)
        const rootAlert = this.resolveRoot(this.alertIconRoot, ROOT_NAMES.alertIconRoot)

        this.safeBuild("labelA", () => {
            if (rootA) {
                this.panelLabelA = this.panelOf(rootA)
                this.labelA = this.buildLabel(this.panelLabelA, SKY)
            }
        })
        this.safeBuild("labelB", () => {
            if (rootB) {
                this.panelLabelB = this.panelOf(rootB)
                this.labelB = this.buildLabel(this.panelLabelB, MINT)
            }
        })
        this.safeBuild("problemCard", () => {
            if (rootProblem) {
                this.panelProblem = this.panelOf(rootProblem)
                this.buildProblem(this.panelProblem)
            }
        })
        this.safeBuild("progressCard", () => {
            if (rootProgress) {
                this.panelProgress = this.panelOf(rootProgress)
                this.buildProgress(this.panelProgress)
            }
        })
        this.safeBuild("raincoatReminder", () => {
            if (rootReminder) {
                this.panelReminder = this.panelOf(rootReminder)
                this.buildReminder(this.panelReminder)
            }
        })
        this.safeBuild("alertIcon", () => {
            if (rootAlert) {
                this.panelAlert = this.panelOf(rootAlert)
                this.buildAlert(this.panelAlert)
            }
        })

        this.applyAll()
        tiLog("ui lens ready")
    }

    private safeBuild(surface: string, fn: () => void): void {
        try {
            fn()
        } catch (e) {
            tiError("TrafficInsightTrafficLensUI: build " + surface + " failed: " + e)
        }
    }

    /** Route label card: plate + [star | title] + time / fuel / weather. */
    private buildLabel(panel: SceneObject, border: vec4): LabelVisuals {
        const v: LabelVisuals = {title: null, time: null, fuel: null, weather: null, weatherIcon: null, star: null}
        this.canvases.push(this.ensureCanvas(panel, LABEL_W, LABEL_H))

        const backing = obj(panel, "Backing")
        const card = makeCardRect(backing, LABEL_W, LABEL_H, {
            color: SLATE_PLATE,
            border: true,
            cornerRadius: CARD_CORNER,
        })
        card.borderColor = border
        card.borderSize = CARD_BORDER

        const content = contentHost(panel)
        const column = flexColumn(content, LABEL_INNER_W, LABEL_INNER_H, {
            gap: LABEL_GAP,
            padX: 0,
            padY: 0,
            justify: FlexJustify.Center,
        })

        const titleRow = flexRow(column, LABEL_INNER_W, LABEL_STAR, {
            gap: LABEL_TITLE_GAP,
            justify: FlexJustify.Start,
            align: FlexAlign.Center,
        })
        flexChild(titleRow, {w: LABEL_STAR, h: LABEL_STAR}, (cell) => {
            const ec = contentOn(cell, "", "Body", LABEL_STAR, LABEL_STAR, "center", this.texStar)
            ec.leadingIconSize = LABEL_STAR * 0.85
            ec.opacity = 0
            v.star = ec
        })
        const title = dynamicText(titleRow, "", "Callout", LABEL_TITLE_W, LABEL_STAR, TEXT_PRIMARY)
        title.horizontalAlignment = HorizontalAlignment.Left
        title.horizontalOverflow = HorizontalOverflow.Shrink
        v.title = title

        v.time = this.labelLine(column, "Body", TEXT_PRIMARY, this.texSchedule)
        v.fuel = this.labelLine(column, "Caption", TEXT_SECONDARY, this.texFuel)
        v.weather = this.labelLine(column, "Caption", TEXT_SECONDARY, this.texWeather, (icon) => { v.weatherIcon = icon })
        return v
    }

    /** One [icon | text] stat row on a route label card. */
    private labelLine(
        column: SceneObject,
        role: "Body" | "Caption",
        color: vec4,
        icon: Texture | undefined,
        captureIcon?: (icon: ElementContent) => void
    ): Text {
        const row = flexRow(column, LABEL_INNER_W, LABEL_LINE_H, {
            gap: LABEL_ROW_GAP,
            justify: FlexJustify.Start,
            align: FlexAlign.Center,
        })
        flexChild(row, {w: LABEL_ROW_ICON, h: LABEL_ROW_ICON}, (cell) => {
            const ec = contentOn(cell, "", "Body", LABEL_ROW_ICON, LABEL_ROW_ICON, "center", icon)
            ec.leadingIconSize = LABEL_ROW_ICON * 0.9
            if (captureIcon) captureIcon(ec)
        })
        const t = dynamicText(row, "", role, LABEL_ROW_TEXT_W, LABEL_LINE_H, color)
        t.horizontalAlignment = HorizontalAlignment.Left
        t.horizontalOverflow = HorizontalOverflow.Shrink
        return t
    }

    /** Problem card: slate plate + [warning | header] + [kind icon | wrapped text]. */
    private buildProblem(panel: SceneObject): void {
        this.canvases.push(this.ensureCanvas(panel, PROBLEM_W, PROBLEM_H))

        const backing = obj(panel, "Backing")
        const card = makeCardRect(backing, PROBLEM_W, PROBLEM_H, {
            color: SLATE_PLATE,
            border: true,
            cornerRadius: CARD_CORNER,
        })
        card.borderColor = CORAL
        card.borderSize = CARD_BORDER
        this.problemCard = card

        const content = contentHost(panel)
        const column = flexColumn(content, PROBLEM_INNER_W, PROBLEM_INNER_H, {
            gap: 0.4,
            padX: 0,
            padY: 0,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })

        const headerRow = flexRow(column, PROBLEM_INNER_W, PROBLEM_HEADER_H, {
            gap: 0.4,
            justify: FlexJustify.Start,
            align: FlexAlign.Center,
        })
        flexChild(headerRow, {w: PROBLEM_HEADER_ICON, h: PROBLEM_HEADER_ICON}, (cell) => {
            const ec = contentOn(cell, "", "Body", PROBLEM_HEADER_ICON, PROBLEM_HEADER_ICON, "center", this.texWarning)
            ec.leadingIconSize = PROBLEM_HEADER_ICON * 0.9
        })
        const header = dynamicText(
            headerRow,
            "Problem ahead",
            "Callout",
            PROBLEM_INNER_W - PROBLEM_HEADER_ICON - 0.4,
            PROBLEM_HEADER_H,
            CORAL
        )
        header.horizontalAlignment = HorizontalAlignment.Left
        header.horizontalOverflow = HorizontalOverflow.Shrink
        this.problemHeader = header

        const row = flexRow(column, PROBLEM_INNER_W, PROBLEM_BODY_H, {
            gap: PROBLEM_GAP,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })
        flexChild(row, {w: PROBLEM_ICON, h: PROBLEM_ICON}, (cell) => {
            const ec = contentOn(cell, "", "Body", PROBLEM_ICON, PROBLEM_ICON, "center", this.texCrash)
            ec.leadingIconSize = PROBLEM_ICON * 0.85
            this.problemIcon = ec
        })
        const t = dynamicText(row, this.problemText, "Body", PROBLEM_TEXT_W, PROBLEM_BODY_H, TEXT_PRIMARY)
        t.horizontalAlignment = HorizontalAlignment.Left
        t.horizontalOverflow = HorizontalOverflow.Wrap
        t.verticalOverflow = VerticalOverflow.Shrink
        this.problemTextComp = t
    }

    /** Progress card: slate plate with a "you are here" yellow border + [clock | "Ridden N of M min"]. */
    private buildProgress(panel: SceneObject): void {
        this.canvases.push(this.ensureCanvas(panel, PROGRESS_W, PROGRESS_H))

        const backing = obj(panel, "Backing")
        const card = makeCardRect(backing, PROGRESS_W, PROGRESS_H, {
            color: SLATE_PLATE,
            border: true,
            cornerRadius: CARD_CORNER,
        })
        card.borderColor = YOU_ARE_HERE
        card.borderSize = CARD_BORDER

        const content = contentHost(panel)
        const row = flexRow(content, PROGRESS_INNER_W, PROGRESS_INNER_H, {
            gap: PROGRESS_GAP,
            padX: 0,
            padY: 0,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })
        flexChild(row, {w: PROGRESS_ICON, h: PROGRESS_ICON}, (cell) => {
            const ec = contentOn(cell, "", "Body", PROGRESS_ICON, PROGRESS_ICON, "center", this.texSchedule)
            ec.leadingIconSize = PROGRESS_ICON * 0.85
        })
        const t = dynamicText(row, this.progressText, "Body", PROGRESS_TEXT_W, PROGRESS_INNER_H, TEXT_PRIMARY)
        t.horizontalAlignment = HorizontalAlignment.Left
        t.horizontalOverflow = HorizontalOverflow.Wrap
        t.verticalOverflow = VerticalOverflow.Shrink
        this.progressTextComp = t
    }

    /** Raincoat reminder: plate + [umbrella | message] + [Proceed | Raincoat on]. */
    private buildReminder(panel: SceneObject): void {
        this.canvases.push(this.ensureCanvas(panel, REMINDER_W, REMINDER_H))

        const backing = obj(panel, "Backing")
        const card = makeCardRect(backing, REMINDER_W, REMINDER_H, {
            color: SLATE_PLATE,
            border: true,
            cornerRadius: CARD_CORNER,
        })
        card.borderColor = AMBER
        card.borderSize = CARD_BORDER

        const content = contentHost(panel)
        const column = flexColumn(content, REMINDER_INNER_W, REMINDER_INNER_H, {
            gap: REMINDER_COL_GAP,
            padX: 0,
            padY: 0,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })

        const msgRow = flexRow(column, REMINDER_INNER_W, REMINDER_MSG_ROW_H, {
            gap: 0.6,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })
        flexChild(msgRow, {w: REMINDER_ICON, h: REMINDER_ICON}, (cell) => {
            const ec = contentOn(cell, "", "Body", REMINDER_ICON, REMINDER_ICON, "center", this.texRain)
            ec.leadingIconSize = REMINDER_ICON * 0.85
        })
        const msg = dynamicText(msgRow, REMINDER_TEXT, "Body", REMINDER_TEXT_W, REMINDER_MSG_ROW_H, TEXT_PRIMARY)
        msg.horizontalAlignment = HorizontalAlignment.Left
        msg.horizontalOverflow = HorizontalOverflow.Wrap
        msg.verticalOverflow = VerticalOverflow.Shrink

        const btnRow = flexRow(column, REMINDER_INNER_W, REMINDER_BTN_H, {
            gap: REMINDER_BTN_GAP,
            justify: FlexJustify.Center,
            align: FlexAlign.Center,
        })
        const proceed = addButton(btnRow, "Skip reminder", REMINDER_BTN_W, REMINDER_BTN_H, () => this.pressProceed(), {
            variant: {shape: "Rectangle", style: "Secondary"},
            leadingIcon: this.texArrow,
        })
        proceed.button.getSceneObject().name = BUTTON_NAMES.proceed
        this.proceedButton = proceed.button
        this.proceedContent = proceed.content

        const raincoat = addButton(
            btnRow,
            "Raincoat on",
            REMINDER_BTN_W,
            REMINDER_BTN_H,
            () => this.pressRaincoatOn(),
            {
                // Secondary, not Primary: Primary's dark gradient fill vanishes on the additive display.
                variant: {shape: "Rectangle", style: "Secondary"},
            }
        )
        raincoat.button.getSceneObject().name = BUTTON_NAMES.raincoatOn
        this.raincoatOnButton = raincoat.button
        this.raincoatOnContent = raincoat.content
    }

    /** Alert icon: one standalone icon, no plate / text / collider, at local zero. */
    private buildAlert(panel: SceneObject): void {
        this.canvases.push(this.ensureCanvas(panel, ALERT_SIZE, ALERT_SIZE))
        const tex = this.alertKind === "rain" ? this.texRain : this.texCrash
        // Text-only fallback ("!") only when both alert textures failed to load.
        const glyph = this.texCrash || this.texRain ? "" : "!"
        const ec = contentOn(panel, glyph, "Headline2", ALERT_SIZE, ALERT_SIZE, "center", tex)
        ec.leadingIconSize = ALERT_ICON_SIZE
        ec.opacity = this.alertOpacity
        this.alertIcon = ec
    }

    // ─── Scene helpers ─────────────────────────────────────────────────────

    private ensureCanvas(panel: SceneObject, w: number, h: number): CanvasController {
        const cc = new CanvasController(panel)
        cc.ensure(new vec2(w, h))
        return cc
    }

    /** Adopt-or-create the "Panel" content child of a root. */
    private panelOf(root: SceneObject): SceneObject {
        const n = root.getChildrenCount()
        for (let i = 0; i < n; i++) {
            const child = root.getChild(i)
            if (child && !isNull(child) && child.name === "Panel") {
                return child
            }
        }
        return obj(root, "Panel")
    }

    private resolveRoot(input: SceneObject | undefined, name: string): SceneObject | null {
        if (input && !isNull(input)) return input
        const own = this.getSceneObject()
        if (own && own.name === name) return own
        const count = global.scene.getRootObjectsCount()
        for (let i = 0; i < count; i++) {
            const found = this.findByName(global.scene.getRootObject(i), name)
            if (found) return found
        }
        tiError("TrafficInsightTrafficLensUI: " + name + " not found")
        return null
    }

    private findByName(so: SceneObject, name: string): SceneObject | null {
        if (!so || isNull(so)) return null
        if (so.name === name) return so
        const n = so.getChildrenCount()
        for (let i = 0; i < n; i++) {
            const found = this.findByName(so.getChild(i), name)
            if (found) return found
        }
        return null
    }

    private loadIcons(): void {
        try {
            this.texCrash = requireAsset("../Icons/car_crash.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon car_crash.png missing, text-only: " + e)
        }
        try {
            this.texRain = requireAsset("../Icons/rainy.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon rainy.png missing, text-only: " + e)
        }
        try {
            this.texStar = requireAsset("../Icons/star_hexfafafa.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon star_hexfafafa.png missing, text-only: " + e)
        }
        try {
            this.texArrow = requireAsset("../Icons/arrow_forward.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon arrow_forward.png missing, text-only: " + e)
        }
        try {
            this.texSchedule = requireAsset("../Icons/schedule.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon schedule.png missing, text-only: " + e)
        }
        try {
            this.texFuel = requireAsset("../Icons/local_gas_station.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon local_gas_station.png missing, text-only: " + e)
        }
        try {
            this.texWeather = requireAsset("../Icons/partly_cloudy_day.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon partly_cloudy_day.png missing, text-only: " + e)
        }
        try {
            this.texWarning = requireAsset("../Icons/warning.png") as Texture
        } catch (e) {
            tiWarn("TrafficInsightTrafficLensUI: icon warning.png missing, text-only: " + e)
        }
    }
}
