/** Compares weekday history over the next hour for the Barcelona commute. No scene access. */
import { recommend } from "./TrafficInsightTripData";
import { DepartureAdvice, RouteMinutes, TripId } from "./TrafficInsightTypes";

interface Bin extends RouteMinutes { days: number }
interface LiveBin extends RouteMinutes { slot: number }
interface Frame { date: string; day: string; minute: number; morning?: Bin; evening?: Bin }
export interface TrafficHistory {
    version: number;
    source: "sample" | "collected";
    corridor?: string;
    validUntil?: number;
    live?: { morning?: LiveBin; evening?: LiveBin };
    week?: { [key: string]: Bin };
    frames?: { [epochMinute: string]: Frame };
}

const SLOT = 15;
const SCENARIOS = [0, 30, 45, 120];
const MIN_SAVING = 5;
const LOOKAHEAD = 60;
export const sampleCount = SCENARIOS.length;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const corridor = "bcn-via-julia-dfactory-v1";

export function isCollectedProfile(value: TrafficHistory): boolean {
    return !!value && value.version === 1 && value.source === "collected" && value.corridor === corridor &&
        Number.isFinite(value.validUntil) && !!value.frames;
}

function tripTitle(trip: TripId): string {
    return trip === "morning" ? "Nou Barris → Zona Franca" : "Zona Franca → Nou Barris";
}

export function weekdayOutlook(history: TrafficHistory, trip: TripId, weekday: number, now: number): string[] {
    const day = WEEKDAYS[weekday];
    const sample = history && history.source === "sample";
    const base = trip === "morning" ? 450 : 1020;
    const demo = sample ? sampleFrames(trip, base) : null;
    const source = sample ? "Sample history" : "Historical typical travel times";
    const slots: {minute: number; route: string; duration: number}[] = [];
    const shift = weekday === 1 ? 0 : weekday >= 5 ? 60 : weekday % 2 === 0 ? 15 : -15;
    for (let minute = 0; minute < 1440; minute += SLOT) {
        const example = demo && demo[minute - shift] && demo[minute - shift][trip];
        const bin = example ? {A: example.A + weekday - 1, B: example.B + weekday - 1, days: example.days}
            : !sample && isCollectedProfile(history) && now < history.validUntil && history.week
                ? history.week[[trip, day, minute].join("/")] : null;
        if (!validBin(bin)) continue;
        const route = recommend(trip, "planning", bin);
        slots.push({minute, route, duration: bin[route]});
    }
    const context = source + " · " + day + " · " + tripTitle(trip);
    if (slots.length < 2) return [context, "Still learning this weekday", "Each estimate needs at least three matching dates.", "Route cards below still apply to leaving now."];
    const lighter = slots.reduce((a, b) => a.duration <= b.duration ? a : b);
    const busiest = slots.reduce((a, b) => a.duration >= b.duration ? a : b);
    const describe = (window: typeof lighter) => clock(window.minute) + "–" + clock(window.minute + SLOT) + " · route " + window.route + " · " + window.duration + " min";
    if (lighter.duration === busiest.duration) {
        return [context, "Similar ride times across sampled slots", describe(lighter), "Route cards below still apply to leaving now."];
    }
    return [context, "Lighter window · " + describe(lighter), "Busiest sampled · " + describe(busiest), "Route cards below still apply to leaving now."];
}

function clock(minute: number): string {
    const m = (minute % 1440 + 1440) % 1440;
    return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
}

function validBin(bin: Bin): boolean {
    return !!bin && Number.isInteger(bin.days) && bin.days >= 3 &&
        validMinutes(bin);
}

function validMinutes(times: RouteMinutes): boolean {
    return Number.isInteger(times.A) && times.A > 0 && Number.isInteger(times.B) && times.B > 0;
}

function fallback(context: string, headline: string, minutes: RouteMinutes = null): DepartureAdvice {
    return { context, headline, now: minutes ? "Compare typical ride times below." : "Route cards use sample trip times.",
        later: "Pick either route to leave now.", minutes, status: "unknown" };
}

export function branchAdvice(): DepartureAdvice {
    return fallback("Branch office", "No traffic history for this office");
}

/** Synthetic Tuesday profiles for the four Preview departures. */
function sampleFrames(trip: TripId, base: number): { [minute: string]: Frame } {
    const morning = trip === "morning";
    const times = morning
        ? [[34, 40], [44, 46], [56, 43], [53, 58], [34, 41], [34, 40], [34, 41], [35, 41]]
        : [[36, 48], [46, 49], [57, 45], [55, 60], [36, 48], [36, 48], [36, 47], [38, 48]];
    const frames: { [minute: string]: Frame } = {};
    for (let i = 0; i <= 16; i++) {
        const minute = base + i * SLOT;
        const frame: Frame = { date: "sample", day: "Tue", minute };
        if (i < times.length) frame[trip] = { A: times[i][0], B: times[i][1], days: 4 };
        frames[minute] = frame;
    }
    return frames;
}

export function departureFor(history: TrafficHistory, trip: TripId, epochMinute: number, scenario = 0): DepartureAdvice {
    const sample = !!history && history.version === 1 && history.source === "sample";
    const base = trip === "morning" ? 450 : 1020;
    const now = sample ? base + SCENARIOS[scenario % sampleCount] : Math.floor(epochMinute);
    const frames = sample ? sampleFrames(trip, base) : history && history.frames;
    const slot = now - now % SLOT;
    const frame = frames && frames[slot];
    const destination = tripTitle(trip);
    if (!sample && (!isCollectedProfile(history) || now >= history.validUntil || !frame)) {
        return fallback(destination, "Traffic estimates unavailable");
    }
    const latest = !sample && history.live && history.live[trip];
    const live = latest && Number.isInteger(latest.slot) && now >= latest.slot && now - latest.slot <= 20 && validMinutes(latest);
    const context = (sample ? "Sample history" : live ? "Recent traffic (within 20 min)" : "Typical traffic · live unavailable") + " · " + frame.day + " " + clock(frame.minute + now - slot) + " · " + destination;
    const current = live ? latest : frame[trip];
    if (!live && !validBin(frame[trip])) return fallback(context, "Still learning this departure time");
    const minutes = { A: current.A, B: current.B };
    const bestRoute = (bin: RouteMinutes) => recommend(trip, "planning", bin);
    const route = bestRoute(current);
    function arrival(departure: number, duration: number): string {
        const end = departure + duration;
        const bucket = end - end % SLOT;
        const destinationFrame = frames[bucket];
        return destinationFrame ? " · arrive " + clock(destinationFrame.minute + end - bucket) : "";
    }
    const via = route === "A" ? " via Pg. de Colom" : " via Pl. Espanya";
    const nowLine = (sample || live ? "Now · " : "Typical now · ") + route + via + " · " + current[route] + " min" + arrival(now, current[route]);
    let best: RouteMinutes = current;
    let bestAt = now;
    let laterRoute = route;
    let compared = 0;
    for (let t = slot + SLOT; t <= now + LOOKAHEAD; t += SLOT) {
        const candidate = frames[t];
        if (!candidate || candidate.date !== frame.date) break;
        if (!validBin(candidate[trip])) continue;
        compared++;
        const next = candidate[trip];
        const nextRoute = bestRoute(next);
        if (next[nextRoute] < best[laterRoute]) {
            best = next;
            bestAt = t;
            laterRoute = nextRoute;
        }
    }
    if (bestAt !== now && current[route] - best[laterRoute] >= MIN_SAVING) {
        return { context, minutes, status: "busy",
            headline: (sample || live ? "Busy now" : "Usually busy at this time") + (route === "B" ? " · B saves " + (current.A - current.B) + " min over A" : " · A is still your quickest route"),
            now: nowLine, later: "Lighter at " + clock(frames[bestAt].minute) + " · " + laterRoute + " · " +
                best[laterRoute] + " min" + arrival(bestAt, best[laterRoute]) + (sample ? "" : " · typical") };
    }
    if (compared < LOOKAHEAD / SLOT) return { ...fallback(context, live ? "Quickest now · route " + route : "Too little history to suggest a departure", minutes), now: nowLine, later: "Still learning later departures." };
    return { context, minutes, status: "good", headline: (sample || live ? "Good time to go · take route " : "Usually a good time to go · route ") + route, now: nowLine,
        later: "No departure in the next hour saves 5 min of riding." };
}
