/** Pure head-pitch/time trigger. Positive pitch means looking down. */
export interface GlanceConfig {
    baselineDeg: number;
    showDeg: number;
    hideDeg: number;
    dwellSec: number;
    maxShowDeg: number;
    maxHideDeg: number;
    showYawDeg: number;
    hideYawDeg: number;
    rearmDeg: number;
    rearmSec: number;
    fadeInSec: number;
    fadeOutSec: number;
}

export const DEFAULT_GLANCE_CONFIG: GlanceConfig = {
    baselineDeg: 0, showDeg: 20, hideDeg: 12, dwellSec: 0.3,
    maxShowDeg: 40, maxHideDeg: 45, showYawDeg: 15, hideYawDeg: 22,
    rearmDeg: 8, rearmSec: 0.5, fadeInSec: 0.15, fadeOutSec: 0.3,
};

export interface GlanceTriggerState {
    phase: "Ready" | "Showing" | "Spent";
    dwellAt: number | null;
    shownAt: number;
    spentAt: number;
    fadeFrom: number;
    levelAt: number | null;
}

/** Interruptions require a fresh level look; holding the head down cannot reopen it. */
export function spentGlance(): GlanceTriggerState {
    return { phase: "Spent", dwellAt: null, shownAt: 0, spentAt: 0, fadeFrom: 0, levelAt: null };
}

export function stepGlance(previous: GlanceTriggerState, pitchDeg: number, now: number,
    allowed: boolean, config: GlanceConfig = DEFAULT_GLANCE_CONFIG, yawDeg: number = 0): { state: GlanceTriggerState; visible: boolean; opacity: number } {
    if (!allowed || !isFinite(pitchDeg) || !isFinite(yawDeg) || !isFinite(now)) return { state: spentGlance(), visible: false, opacity: 0 };
    const s = { ...previous };
    const down = pitchDeg - config.baselineDeg;
    const fadeOut = Math.max(0.01, config.fadeOutSec);
    let opacity = 0;

    if (s.phase === "Spent") {
        opacity = s.fadeFrom * Math.max(0, 1 - (now - s.spentAt) / fadeOut);
        if (Math.abs(down) <= config.rearmDeg) {
            if (s.levelAt === null) s.levelAt = now;
            if (now - s.levelAt >= config.rearmSec && opacity <= 0) {
                s.phase = "Ready";
                s.dwellAt = null;
            }
        } else s.levelAt = null;
    }
    if (s.phase === "Ready") {
        opacity = s.fadeFrom * Math.max(0, 1 - (now - s.spentAt) / fadeOut);
        if (down >= config.showDeg && down <= config.maxShowDeg && Math.abs(yawDeg) <= config.showYawDeg) {
            if (s.dwellAt === null) s.dwellAt = now;
            if (now - s.dwellAt >= config.dwellSec) {
                s.phase = "Showing";
                s.shownAt = now;
                s.levelAt = null;
            }
        } else s.dwellAt = null;
    }
    if (s.phase === "Showing") {
        const elapsed = Math.max(0, now - s.shownAt);
        opacity = Math.min(1, elapsed / Math.max(0.01, config.fadeInSec));
        // No duration deadline: remain visible while the user keeps this viewing direction.
        if (down < config.hideDeg || down > config.maxHideDeg || Math.abs(yawDeg) > config.hideYawDeg) {
            // A natural look-away permits looking back into the same direction.
            // Explicit dismissal/interruption uses spentGlance() and needs a level look.
            s.phase = "Ready";
            s.dwellAt = null;
            s.spentAt = now;
            s.fadeFrom = opacity;
            s.levelAt = Math.abs(down) <= config.rearmDeg ? now : null;
        }
    }
    return { state: s, visible: opacity > 0, opacity };
}
