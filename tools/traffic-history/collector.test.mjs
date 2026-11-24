import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, forecast, localSlot, openHistory } from './collector.mjs';

const minute = iso => Date.parse(iso) / 60000;

test('partial responses and repeated runs never produce an unpaired or duplicate comparison', async () => {
    const db = openHistory(':memory:');
    try {
        const now = minute('2026-11-24T07:00Z');
        await assert.rejects(collect(db, now, async (dir, route) => {
            if (dir === 'morning' && route === 'B') throw Error('timeout');
            return 1800;
        }), /morning/);
        const calls = [];
        await collect(db, now + 4, async (dir, route) => { calls.push(dir + route); return 2700; });
        await collect(db, now + 8, async () => assert.fail('unnecessary request'));
        assert.deepEqual(calls, ['morningA', 'morningB']);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM observations').get().n, 2);
    } finally { db.close(); }
});

test('three same-weekday dates produce direction-specific medians at Barcelona time across DST', async () => {
    const db = openHistory(':memory:');
    try {
        const now = minute('2026-11-03T07:00Z');
        const dates = ['2026-10-13T06:00Z', '2026-10-20T06:00Z', '2026-10-27T07:00Z'];
        for (let i = 0; i < dates.length; i++) {
            if (i === 2) assert.equal(forecast(db, now).frames[now].morning, undefined);
            await collect(db, minute(dates[i]), async (dir, route) =>
                60 * ([30, 80, 40][i] + (route === 'B' ? 8 : 0) + (dir === 'evening' ? 5 : 0)));
        }
        const profile = forecast(db, now);
        assert.deepEqual(profile.frames[now].morning, { A: 40, B: 48, days: 3 });
        assert.deepEqual(profile.frames[now].evening, { A: 45, B: 53, days: 3 });
        assert.equal(profile.frames[now+15].morning, undefined);
        assert.equal(profile.frames[now+1440].morning, undefined);
        assert.equal(profile.frames[now].minute, 480);
        assert.deepEqual(localSlot(minute('2026-10-25T00:15Z')), localSlot(minute('2026-10-25T01:15Z')));
    } finally { db.close(); }
});
