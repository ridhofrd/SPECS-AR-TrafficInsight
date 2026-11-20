/** Pure head-pitch/time trigger. Positive pitch means looking down. */
export interface GlanceConfig {
    baselineDeg: number;
    showDeg: number;
    hideDeg: number;
    dwellSec: number;
    capSec: number;
    rearmDeg: number;
    rearmSec: number;
    fadeInSec: number;
    fadeOutSec: number;
}

export const DEFAULT_GLANCE_CONFIG: GlanceConfig = {
    baselineDeg: 0, showDeg: 20, hideDeg: 12, dwellSec: 0.3,
    capSec: 2, rearmDeg: 8, rearmSec: 0.5, fadeInSec: 0.15, fadeOutSec: 0.3,
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
    allowed: boolean, config: GlanceConfig = DEFAULT_GLANCE_CONFIG): { state: GlanceTriggerState; visible: boolean; opacity: number } {
    if (!allowed || !isFinite(pitchDeg) || !isFinite(now)) return { state: spentGlance(), visible: false, opacity: 0 };
    const s = { ...previous };
    const down = pitchDeg - config.baselineDeg;
    const cap = Math.min(2, Math.max(0.1, config.capSec));
    const fadeOut = Math.min(cap, Math.max(0.01, config.fadeOutSec));
    let opacity = 0;

    if (s.phase === "Spent") {
        // Early look-up fades are still bounded by the original show deadline.
        opacity = Math.min(s.fadeFrom * Math.max(0, 1 - (now - s.spentAt) / fadeOut),
            Math.max(0, (s.shownAt + cap - now) / fadeOut));
        if (Math.abs(down) <= config.rearmDeg) {
            if (s.levelAt === null) s.levelAt = now;
            if (now - s.levelAt >= config.rearmSec && opacity <= 0) {
                s.phase = "Ready";
                s.dwellAt = null;
            }
        } else s.levelAt = null;
    }
    if (s.phase === "Ready") {
        if (down >= config.showDeg) {
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
        opacity = Math.min(1, elapsed / Math.max(0.01, config.fadeInSec), Math.max(0, (cap - elapsed) / fadeOut));
        if (down < config.hideDeg || elapsed >= cap) {
            s.phase = "Spent";
            s.spentAt = now;
            s.fadeFrom = opacity;
            s.levelAt = Math.abs(down) <= config.rearmDeg ? now : null;
        }
    }
    return { state: s, visible: opacity > 0, opacity };
}
