import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const database = resolve(root, '.traffic-history/observations.sqlite');
const asset = resolve(root, 'Assets/TrafficHistory.json');
export const corridor = 'bcn-via-julia-dfactory-v1';
const home = '41.44385,2.17860';
const office = '41.33583,2.13824';
// Public road waypoints separate the waterfront and inland corridors in both directions.
const via = { A: '41.38055,2.18170', B: '41.37512,2.14908' };
const directions = ['morning', 'evening'];
const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function localSlot(epochMinute) {
    const parts = Object.fromEntries(clock.formatToParts(epochMinute * 60000).map(p => [p.type, p.value]));
    return { date: [parts.year, parts.month, parts.day].join('-'), day: parts.weekday,
        minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function openHistory(path) {
    const db = new DatabaseSync(path);
    db.exec(`PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS observations (
            corridor TEXT NOT NULL, slot INTEGER NOT NULL, direction TEXT NOT NULL,
            aSeconds INTEGER NOT NULL, bSeconds INTEGER NOT NULL,
            PRIMARY KEY (corridor, slot, direction)
        )`);
    return db;
}

export async function duration(direction, route, key, request = fetch) {
    const points = direction === 'morning' ? [home, via[route], office] : [office, via[route], home];
    const url = new URL('https://api.tomtom.com/routing/1/calculateRoute/' + points.join(':') + '/json');
    url.search = new URLSearchParams({ key, traffic: 'true', travelMode: 'motorcycle',
        routeType: 'fastest', routeRepresentation: 'summaryOnly', departAt: 'now' });
    const response = await request(url, {signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('routing provider returned HTTP ' + response.status);
    const seconds = (await response.json()).routes?.[0]?.summary?.travelTimeInSeconds;
    if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('missing travel time');
    return seconds;
}

// Keep each comparison paired. A failed leg is retried without overwriting a successful direction.
export async function collect(db, epochMinute, readDuration) {
    const slot = epochMinute - epochMinute % 15;
    const failures = [];
    for (const direction of directions) {
        if (db.prepare('SELECT 1 FROM observations WHERE corridor=? AND slot=? AND direction=?')
            .get(corridor, slot, direction)) continue;
        try {
            const [a, b] = await Promise.all(['A', 'B'].map(route => readDuration(direction, route)));
            db.prepare('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?)').run(corridor, slot, direction, a, b);
        } catch (error) { failures.push(direction + ' (' + error.message + ')'); }
    }
    if (failures.length) throw new Error(failures.join(', '));
}

function median(values) {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return (values[Math.floor((values.length - 1) / 2)] + values[middle]) / 2;
}

export function forecast(db, now) {
    // One vote per local date even when a clock hour repeats in October.
    const grouped = new Map();
    const rows = db.prepare('SELECT * FROM observations WHERE corridor=? AND slot>=? AND slot<=?')
        .all(corridor, now - 12 * 7 * 1440, now);
    for (const row of rows) {
        const { date, day, minute } = localSlot(row.slot);
        const key = [row.direction, day, minute].join('/');
        if (!grouped.has(key)) grouped.set(key, new Map());
        const dates = grouped.get(key);
        if (!dates.has(date)) dates.set(date, { A: [], B: [] });
        dates.get(date).A.push(row.aSeconds);
        dates.get(date).B.push(row.bSeconds);
    }
    const bins = new Map();
    for (const [key, dates] of grouped) {
        const samples = [...dates.values()];
        if (samples.length < 3) continue;
        const minutes = route => Math.max(1, Math.round(median(samples.map(s => median(s[route]))) / 60));
        bins.set(key, { A: minutes('A'), B: minutes('B'), days: samples.length });
    }
    const frames = {};
    const start = now - now % 15;
    // The last day supplies clock labels for journeys crossing the publication window.
    for (let t = start; t < start + 8 * 1440; t += 15) {
        const frame = localSlot(t);
        for (const direction of directions) frame[direction] = bins.get([direction, frame.day, frame.minute].join('/'));
        frames[t] = frame;
    }
    return { version: 1, corridor, source: 'collected', validUntil: start + 7 * 1440, frames };
}

function publish(db) {
    const profile = forecast(db, Math.floor(Date.now() / 60000));
    const temp = asset + '.' + randomUUID() + '.tmp';
    writeFileSync(temp, JSON.stringify(profile) + '\n');
    renameSync(temp, asset);
}

async function run() {
    const args = process.argv.slice(2);
    if (args.some(a => !['--watch', '--publish', '--export-only'].includes(a)) ||
        (args.includes('--export-only') && args.includes('--watch'))) throw new Error('Use [--watch] [--publish] or --export-only');
    const exportOnly = args.includes('--export-only');
    const key = process.env.TOMTOM_API_KEY;
    if (!exportOnly && !key) throw new Error('Set TOMTOM_API_KEY in the collector environment.');
    mkdirSync(dirname(database), {recursive: true});
    const db = openHistory(database);
    try {
        if (exportOnly) { publish(db); return; }
        do {
            let failed = false;
            try {
                await collect(db, Math.floor(Date.now() / 60000), (dir, route) => duration(dir, route, key));
                if (args.includes('--publish')) publish(db);
                console.log(new Date().toISOString(), 'Collection complete.');
            } catch (error) {
                if (!args.includes('--watch')) throw error;
                console.error(new Date().toISOString(), error.message);
                failed = true;
            }
            if (!args.includes('--watch')) break;
            const untilBoundary = 900000 - Date.now() % 900000 + 1000;
            await wait(failed ? Math.min(60000, untilBoundary) : untilBoundary);
        } while (true);
    } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
