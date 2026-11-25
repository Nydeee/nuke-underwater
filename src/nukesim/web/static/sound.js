// Sound, made in the browser (no audio files). What you hear is timed by the physics:
// the boom plays when the simulator's blast front reaches the camera (so it comes late
// if you are far away, at the speed of sound), a muffled thud when the shock in the
// water reaches an underwater camera, and a wash when the big waves pass.
// How it sounds (the mix of noise and low tones) is our design, not a recording.

export function createSound() {
  let ctx = null, master = null, noise = null;
  let muted = false;
  try { muted = localStorage.getItem("nukesim.muted") === "1"; } catch (_) { /* ignore */ }

  function ensure() {   // browsers only allow sound after a click or key press
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();   // keep big booms from clipping
      comp.threshold.value = -18; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }   // brown-ish noise
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  window.addEventListener("pointerdown", ensure, { once: true });
  window.addEventListener("keydown", ensure, { once: true });

  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; }
  function env(g, t0, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** The blast arriving. strength 0..1; muffled = heard underwater. */
  function boom(strength = 0.5, muffled = false) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime, s = Math.min(Math.max(strength, 0.08), 1);
    // crack: a sharp burst of noise
    const n1 = noiseSrc(), f1 = ctx.createBiquadFilter(), g1 = ctx.createGain();
    f1.type = "lowpass"; f1.frequency.value = muffled ? 300 : 900 + 2500 * s;
    n1.connect(f1); f1.connect(g1); g1.connect(master);
    env(g1, t0, 0.008, 0.9 * s, muffled ? 0.6 : 0.9);
    n1.start(t0); n1.stop(t0 + 2);
    // body: deep rumble that rolls on
    const n2 = noiseSrc(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain();
    f2.type = "lowpass"; f2.frequency.value = muffled ? 120 : 180;
    n2.connect(f2); f2.connect(g2); g2.connect(master);
    env(g2, t0, 0.05, 1.2 * s, 3 + 5 * s);
    n2.start(t0, Math.random() * 3); n2.stop(t0 + 10);
    // thump: a falling low tone
    const o = ctx.createOscillator(), go = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(muffled ? 55 : 70, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 1.2);
    o.connect(go); go.connect(master);
    env(go, t0, 0.01, 0.9 * s, 1.4);
    o.start(t0); o.stop(t0 + 2);
  }

  /** A wave passing. */
  function wash(strength = 0.4) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime, n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.6;
    n.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35 * Math.min(strength, 1) + 0.05, t0 + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4);
    n.start(t0, Math.random() * 3); n.stop(t0 + 4.5);
  }

  /** A falling bomb's whistle, sliding down in pitch over `dur` seconds. */
  function whistle(dur = 4) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "sine"; o.frequency.setValueAtTime(1500, t0); o.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    f.type = "lowpass"; f.frequency.value = 2500;
    o.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.6); g.gain.setValueAtTime(0.12, t0 + dur - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /** A short tick for the countdown. */
  function tick(high = false) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = high ? 880 : 520;
    o.connect(g); g.connect(master);
    env(g, t0, 0.005, 0.25, 0.15);
    o.start(t0); o.stop(t0 + 0.25);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem("nukesim.muted", m ? "1" : "0"); } catch (_) { /* ignore */ }
    if (master) master.gain.value = m ? 0 : 0.9;
  }
  return { unlock: ensure, boom, wash, tick, whistle, setMuted, get muted() { return muted; } };
}
