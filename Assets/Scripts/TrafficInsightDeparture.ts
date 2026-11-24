/** Compares weekday history over the next hour for the Barcelona commute. No scene access. */
import { recommend } from "./TrafficInsightTripData";
import { DepartureAdvice, RouteMinutes, TripId } from "./TrafficInsightTypes";

interface Bin extends RouteMinutes { days: number }
interface Frame { date: string; day: string; minute: number; morning?: Bin; evening?: Bin }
export interface TrafficHistory {
    version: number;
    source: "sample" | "collected";
    corridor?: string;
    validUntil?: number;
    frames?: { [epochMinute: string]: Frame };
}

const SLOT = 15;
const SCENARIOS = [0, 30, 45, 120];
const MIN_SAVING = 5;
const LOOKAHEAD = 60;
export const sampleCount = SCENARIOS.length;
const corridor = "bcn-via-julia-dfactory-v1";

function clock(minute: number): string {
    const m = (minute % 1440 + 1440) % 1440;
    return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
}

function validBin(bin: Bin): boolean {
    return !!bin && Number.isInteger(bin.days) && bin.days >= 3 &&
        Number.isInteger(bin.A) && bin.A > 0 && Number.isInteger(bin.B) && bin.B > 0;
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
    const destination = trip === "morning" ? "Nou Barris → Zona Franca" : "Zona Franca → Nou Barris";
    if (!sample && (!history || history.version !== 1 || history.source !== "collected" ||
        history.corridor !== corridor || !Number.isFinite(history.validUntil) || now >= history.validUntil || !frame)) {
        return fallback(destination, "No current history for this departure");
    }
    const context = (sample ? "Sample history" : "Barcelona history") + " · " + frame.day + " " + clock(frame.minute + now - slot) + " · " + destination;
    const current = frame[trip];
    if (!validBin(current)) return fallback(context, "Still learning this departure time");
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
    const nowLine = "Now · " + route + via + " · " + current[route] + " min" + arrival(now, current[route]);
    let best = current;
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
            headline: route === "B" ? "Busy now · B saves " + (current.A - current.B) + " min over A" : "Busy now · A is still your quickest route",
            now: nowLine, later: "Lighter at " + clock(frames[bestAt].minute) + " · " + laterRoute + " · " +
                best[laterRoute] + " min" + arrival(bestAt, best[laterRoute]) };
    }
    if (compared < LOOKAHEAD / SLOT) return { ...fallback(context, "Too little history to suggest a departure", minutes), now: nowLine };
    return { context, minutes, status: "good", headline: "Good time to go · take route " + route, now: nowLine,
        later: "No departure in the next hour saves 5 min of riding." };
}
