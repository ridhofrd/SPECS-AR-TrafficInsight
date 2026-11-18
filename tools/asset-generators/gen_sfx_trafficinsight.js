const path = require('path');
const fs = require('fs');
// Path to the CLAD build-sfx tools folder, e.g. <claude plugins cache>/ls-clad/<version>/skills/build-sfx/tools
const audio = require(process.env.CLAD_BUILD_SFX_TOOLS);
const PROJECT_ASSETS_SFX = path.resolve(__dirname, '..', '..', 'Assets', 'GeneratedSFX');
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });
const p = audio.sfx_presets;
const SR = audio.SAMPLE_RATE;

function trim(buf, seconds, fade) {
  const n = Math.min(Math.floor(seconds * SR), buf.left ? buf.left.length : buf.length);
  if (buf.left) {
    const o = { left: buf.left.slice(0, n), right: buf.right.slice(0, n) };
    audio.fadeOut(o.left, fade); audio.fadeOut(o.right, fade); return o;
  }
  const o = buf.slice(0, n); audio.fadeOut(o, fade); return o;
}
function hpf(buf, f) { return audio.mix_bus.applyFx(buf, { hpf: f }); }

const jobs = [
  // Calm two-bell ding-dong, ~1.2 s decay, quiet ceiling
  { name: 'AlertChime', ceiling: 0.45, render: () => trim(audio.mix_bus.applyFx(p.uiNotify(), { hpf: 200, lpf: 6000, reverb: 'smallRoom' }), 1.3, 0.15) },
  // Rising two-blip confirmation, softened, short room tail to ~0.4 s
  { name: 'RouteSetTone', ceiling: 0.4, render: () => trim(audio.mix_bus.applyFx(p.uiToggle({ on: true, pitch: -3 }), { hpf: 200, lpf: 5000, reverb: 'smallRoom' }), 0.42, 0.08) },
  // Warm ascending mallet/bell resolve, ~0.8 s, low level
  { name: 'ArrivedTone', ceiling: 0.4, render: () => trim(audio.mix_bus.applyFx(p.uiSuccess(), { hpf: 150, lpf: 5000, reverb: 'smallRoom' }), 0.85, 0.2) },
  // Soft crisp UI tick
  { name: 'ButtonClick', ceiling: 0.35, render: () => { const b = hpf(p.uiClick({ character: 'soft' }), 120); audio.fadeOut(b.left ? b.left : b, 0.005); return b; } },
];

const report = [];
for (const j of jobs) {
  const buf = j.render();
  audio.mix_bus.masterChain(buf, { normalize: 'peak', peakCeiling: j.ceiling });
  const out = path.join(PROJECT_ASSETS_SFX, j.name + '.wav');
  audio.WavBuilder.write(buf, out);
  const chans = buf.left ? [buf.left, buf.right] : [buf];
  let peak = 0; for (const c of chans) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  report.push({ name: j.name, path: out, duration_s: +(chans[0].length / SR).toFixed(3), peak_db: +(20 * Math.log10(peak)).toFixed(1), channels: chans.length });
}
console.log(JSON.stringify(report, null, 1));
