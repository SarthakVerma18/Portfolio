/* Small interactive figures that explain each project.
   Every figure is a <figure class="pfig" data-fig="..."> with a canvas,
   optional controls and a .fig-readout line. */
(function () {
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = {};
  // Theme tokens are OKLCH; the canvas resolves any CSS colour, so read
  // each back as rgb() once and derive alpha variants from that.
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  function toRGB(css) {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000";
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function readColors() {
    const cs = getComputedStyle(root);
    ["ink", "muted", "rule", "accent", "paper", "paper-2"].forEach(k => {
      C[k] = toRGB(cs.getPropertyValue("--color-" + k).trim());
    });
  }
  readColors();

  function rgba(rgb, a) { return rgb.replace("rgb(", "rgba(").replace(")", "," + a + ")"); }
  function rng(seed) {                    // mulberry32
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
  const mono = px => px + "px 'IBM Plex Mono', ui-monospace, monospace";

  const figs = [];

  function makeFig(el, spec) {
    const canvas = el.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const readout = el.querySelector(".fig-readout");
    const f = { el, ctx, W: 0, H: 0, readout, visible: false, running: false };

    f.render = () => { if (f.W) spec.draw(f); };
    f.resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      f.W = r.width; f.H = r.height;
      canvas.width = Math.round(f.W * dpr);
      canvas.height = Math.round(f.H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.render();
    };
    let last = 0;
    function loop(now) {
      if (!f.visible) { f.running = false; return; }
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      spec.tick(f, dt);
      f.render();
      requestAnimationFrame(loop);
    }
    f.start = () => {
      if (!spec.tick || reduceMotion || f.running || !f.visible) return;
      f.running = true; last = 0;
      requestAnimationFrame(loop);
    };

    if (spec.init) spec.init(f);
    new ResizeObserver(f.resize).observe(canvas);
    new IntersectionObserver(([e]) => { f.visible = e.isIntersecting; if (f.visible) f.start(); })
      .observe(canvas);
    figs.push(f);
    return f;
  }

  document.addEventListener("themechange", () => { readColors(); figs.forEach(f => f.render()); });

  const specs = {};

  /* ---------- Mini OS: round-robin scheduler ---------- */
  specs.scheduler = {
    init(f) {
      f.procs = [
        { name: "init", arrive: 0, burst: 5 },
        { name: "shell", arrive: 1, burst: 3 },
        { name: "worker", arrive: 2, burst: 7 },
        { name: "idle", arrive: 4, burst: 2 }
      ];
      f.q = 2; f.t = 0;
      const input = f.el.querySelector("input");
      const out = f.el.querySelector("output");
      const update = () => { f.q = +input.value; out.textContent = f.q; f.schedule(); f.render(); };
      f.schedule = () => {
        const ps = f.procs.map(p => ({ ...p, rem: p.burst, done: 0 }));
        const slices = [], queue = [];
        let time = 0, next = 0, switches = 0, prev = null;
        const admit = () => { while (next < ps.length && ps[next].arrive <= time) queue.push(ps[next++]); };
        admit();
        while (queue.length || next < ps.length) {
          if (!queue.length) { time = ps[next].arrive; admit(); continue; }
          const p = queue.shift();
          const run = Math.min(f.q, p.rem);
          if (prev && prev !== p) switches++;
          slices.push({ p: ps.indexOf(p), start: time, end: time + run });
          time += run; p.rem -= run; prev = p;
          admit();
          if (p.rem > 0) queue.push(p); else p.done = time;
        }
        const wait = ps.reduce((s, p) => s + (p.done - p.arrive - p.burst), 0) / ps.length;
        const tat = ps.reduce((s, p) => s + (p.done - p.arrive), 0) / ps.length;
        f.slices = slices; f.end = time;
        f.readout.textContent = "quantum " + f.q + " ticks, " + switches + " context switches, avg wait " +
          wait.toFixed(2) + ", avg turnaround " + tat.toFixed(2);
      };
      input.addEventListener("input", update);
      update();
    },
    tick(f, dt) { f.t = (f.t + dt * 2.2) % (f.end + 3); },
    draw(f) {
      const { ctx, W, H } = f;
      ctx.clearRect(0, 0, W, H);
      const left = 62, right = 12, top = 14, rowH = (H - top - 30) / f.procs.length;
      const sx = t => left + (t / f.end) * (W - left - right);
      ctx.font = mono(11);
      ctx.textBaseline = "middle";
      f.procs.forEach((p, i) => {
        const y = top + i * rowH + rowH / 2;
        ctx.fillStyle = C.muted;
        ctx.fillText(p.name, 6, y);
        ctx.strokeStyle = C.rule;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - right, y); ctx.stroke();
        // arrival tick
        ctx.fillStyle = C.muted;
        ctx.fillRect(sx(p.arrive) - 0.5, y - rowH * 0.32, 1, rowH * 0.64);
      });
      const playT = reduceMotion ? f.end : f.t;
      f.slices.forEach((s, k) => {
        const y = top + s.p * rowH + rowH * 0.22;
        const x0 = sx(s.start), x1 = sx(Math.min(s.end, Math.max(s.start, playT)));
        if (playT <= s.start) return;
        ctx.fillStyle = k % 2 ? rgba(C.accent, 0.75) : rgba(C.accent, 0.55);
        ctx.fillRect(x0 + 0.5, y, Math.max(0, x1 - x0 - 1), rowH * 0.56);
      });
      // axis
      const ay = H - 14;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      for (let t = 0; t <= f.end; t += f.end > 20 ? 4 : 2) ctx.fillText(t, sx(t), ay);
      ctx.textAlign = "left";
      if (!reduceMotion && playT <= f.end) {
        ctx.strokeStyle = C.ink;
        ctx.beginPath(); ctx.moveTo(sx(playT), top - 4); ctx.lineTo(sx(playT), ay - 9); ctx.stroke();
      }
    }
  };

  /* ---------- Transformer: walk-forward validation ---------- */
  specs.walkforward = {
    init(f) {
      const r = rng(7);
      f.N = 132; f.train = 48; f.test = 12;
      f.folds = Math.floor((f.N - f.train) / f.test);
      f.price = [];
      let p = 100, m = 0;
      for (let i = 0; i < f.N; i++) { m = 0.85 * m + 0.25 * gauss(r); p *= 1 + (m + 0.6 * gauss(r)) / 100; f.price.push(p); }
      f.fold = 0; f.clock = 0; f.auto = true;
      const input = f.el.querySelector("input");
      input.max = f.folds;
      f.input = input;
      input.addEventListener("input", () => { f.auto = false; f.fold = +input.value - 1; f.render(); });
    },
    tick(f, dt) {
      if (!f.auto) return;
      f.clock += dt;
      if (f.clock > 1.3) { f.clock = 0; f.fold = (f.fold + 1) % f.folds; f.input.value = f.fold + 1; }
    },
    draw(f) {
      const { ctx, W, H } = f;
      ctx.clearRect(0, 0, W, H);
      const pad = 10, top = 22, bot = 22;
      const lo = Math.min(...f.price), hi = Math.max(...f.price);
      const sx = i => pad + (i / (f.N - 1)) * (W - 2 * pad);
      const sy = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);
      const t0 = f.fold * f.test, t1 = t0 + f.train, t2 = t1 + f.test;

      ctx.fillStyle = rgba(C.ink, 0.06);
      ctx.fillRect(sx(t0), top - 8, sx(t1) - sx(t0), H - top - bot + 16);
      ctx.fillStyle = rgba(C.accent, 0.16);
      ctx.fillRect(sx(t1), top - 8, sx(t2) - sx(t1), H - top - bot + 16);

      // future, unseen
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rgba(C.muted, 0.35);
      ctx.beginPath();
      f.price.forEach((v, i) => i >= t2 - 1 && (i === t2 - 1 ? ctx.moveTo(sx(i), sy(v)) : ctx.lineTo(sx(i), sy(v))));
      ctx.stroke();
      // seen
      ctx.strokeStyle = C.ink;
      ctx.beginPath();
      for (let i = 0; i < t2; i++) i ? ctx.lineTo(sx(i), sy(f.price[i])) : ctx.moveTo(sx(i), sy(f.price[i]));
      ctx.stroke();

      ctx.font = mono(11);
      ctx.fillStyle = C.muted;
      ctx.fillText("train", sx(t0) + 6, 12);
      ctx.fillStyle = C.accent;
      ctx.fillText("test", sx(t1) + 4, 12);
      ctx.fillStyle = C.muted;
      if (t2 < f.N - 8) ctx.fillText("unseen", sx(t2) + 6, 12);

      f.readout.textContent = "fold " + (f.fold + 1) + "/" + f.folds + ", fit on t = " + t0 + " to " + (t1 - 1) +
        ", score on t = " + t1 + " to " + (t2 - 1) + ", the model never trains on its own test window";
    }
  };

  /* ---------- Trading Strategy Arena: frictions ---------- */
  specs.frictions = {
    init(f) {
      f.seed = 3;
      const cost = f.el.querySelector("input[type=range]");
      const out = f.el.querySelector("output");
      const lag = f.el.querySelector("input[type=checkbox]");
      const btn = f.el.querySelector("button");
      f.cost = +cost.value; f.lag = lag.checked;
      const gen = () => {
        const r = rng(f.seed);
        f.ret = []; let m = 0;
        for (let i = 0; i < 320; i++) { m = 0.92 * m + gauss(r) * 0.3; f.ret.push((0.3 * m + gauss(r) * 0.55) / 100); }
      };
      f.run = () => {
        const n = f.ret.length, look = 6;
        const pos = new Array(n).fill(0);
        for (let i = look; i < n; i++) {
          let s = 0; for (let k = 1; k <= look; k++) s += f.ret[i - k];
          pos[i] = s > 0 ? 1 : -1;
        }
        const L = f.lag ? 1 : 0, c = f.cost / 10000;
        let ideal = 1, real = 1, trades = 0;
        f.ideal = [1]; f.real = [1]; f.px = [1];
        let px = 1;
        for (let i = 1; i < n; i++) {
          px *= 1 + f.ret[i];
          ideal *= 1 + pos[i] * f.ret[i];
          const p = pos[i - L] || 0, pp = pos[i - L - 1] || 0;
          if (p !== pp) trades++;
          real *= 1 + p * f.ret[i] - c * Math.abs(p - pp);
          f.ideal.push(ideal); f.real.push(real); f.px.push(px);
        }
        const pct = v => (v >= 1 ? "+" : "") + ((v - 1) * 100).toFixed(1) + "%";
        f.readout.textContent = "frictionless " + pct(ideal) + ", with " + f.cost + " bps" +
          (f.lag ? " + 1-bar latency " : " ") + pct(real) + ", " + trades + " position flips";
        f.render();
      };
      cost.addEventListener("input", () => { f.cost = +cost.value; out.textContent = f.cost; f.run(); });
      lag.addEventListener("change", () => { f.lag = lag.checked; f.run(); });
      btn.addEventListener("click", () => { f.seed++; gen(); f.run(); });
      gen(); f.run();
    },
    draw(f) {
      const { ctx, W, H } = f;
      if (!f.real) return;
      ctx.clearRect(0, 0, W, H);
      const all = f.ideal.concat(f.real, f.px);
      const lo = Math.min(...all), hi = Math.max(...all);
      const pad = 10, top = 12, bot = 12;
      const n = f.real.length;
      const sx = i => pad + (i / (n - 1)) * (W - 2 * pad - 70);
      const sy = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);
      const line = (arr, color, width, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
        ctx.beginPath(); arr.forEach((v, i) => i ? ctx.lineTo(sx(i), sy(v)) : ctx.moveTo(sx(i), sy(v))); ctx.stroke();
        ctx.setLineDash([]);
      };
      ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, sy(1)); ctx.lineTo(W - pad - 70, sy(1)); ctx.stroke();
      line(f.px, rgba(C.muted, 0.45), 1);
      line(f.ideal, C.ink, 1.3, [4, 3]);
      line(f.real, C.accent, 1.8);
      ctx.font = mono(11); ctx.textBaseline = "middle";
      const label = (arr, text, color) => { ctx.fillStyle = color; ctx.fillText(text, W - pad - 64, sy(arr[n - 1])); };
      label(f.px, "market", C.muted);
      label(f.ideal, "ideal", C.ink);
      label(f.real, "realistic", C.accent);
    }
  };

  /* ---------- SPICE optimiser: simulated annealing ---------- */
  specs.annealing = {
    init(f) {
      f.fn = x => 0.55 * Math.sin(3 * x) + 0.35 * Math.sin(7.3 * x + 1) + 0.045 * (x - 6.3) * (x - 6.3);
      f.r = rng(11);
      const input = f.el.querySelector("input");
      const out = f.el.querySelector("output");
      f.alpha = +input.value;
      input.addEventListener("input", () => { f.alpha = +input.value; out.textContent = f.alpha.toFixed(3); f.reset(); });
      f.el.querySelector("button").addEventListener("click", () => f.reset());
      f.reset = () => {
        f.x = 0.4 + f.r() * 1.5; f.T = 2; f.best = f.x; f.trail = []; f.pause = 0; f.steps = 0;
        if (reduceMotion) { while (f.T > 0.004) f.step(); }
        f.render();
      };
      f.step = () => {
        const cand = Math.min(10, Math.max(0, f.x + gauss(f.r) * (0.25 + f.T * 0.6)));
        const d = f.fn(cand) - f.fn(f.x);
        if (d < 0 || f.r() < Math.exp(-d / f.T)) f.x = cand;
        if (f.fn(f.x) < f.fn(f.best)) f.best = f.x;
        f.T *= f.alpha; f.steps++;
        f.trail.push(f.x); if (f.trail.length > 40) f.trail.shift();
      };
      f.reset();
    },
    tick(f, dt) {
      if (f.T > 0.004) { for (let i = 0; i < 2; i++) f.step(); }
      else if ((f.pause += dt) > 1.6) f.reset();
    },
    draw(f) {
      const { ctx, W, H } = f;
      ctx.clearRect(0, 0, W, H);
      const pad = 10, top = 18, bot = 14;
      let lo = Infinity, hi = -Infinity;
      for (let x = 0; x <= 10; x += 0.02) { const v = f.fn(x); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const sx = x => pad + (x / 10) * (W - 2 * pad);
      const sy = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = 0; x <= 10; x += 0.02) x ? ctx.lineTo(sx(x), sy(f.fn(x))) : ctx.moveTo(sx(x), sy(f.fn(x)));
      ctx.stroke();
      f.trail.forEach((x, i) => {
        ctx.fillStyle = rgba(C.accent, (i / f.trail.length) * 0.35);
        ctx.beginPath(); ctx.arc(sx(x), sy(f.fn(x)), 3, 0, 7); ctx.fill();
      });
      // best so far
      ctx.strokeStyle = C.muted; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(sx(f.best), top - 10); ctx.lineTo(sx(f.best), H - bot); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(sx(f.x), sy(f.fn(f.x)), 5, 0, 7); ctx.fill();
      // temperature bar
      ctx.fillStyle = rgba(C.accent, 0.2);
      ctx.fillRect(pad, 4, (W - 2 * pad) * Math.min(1, f.T / 2), 3);
      f.readout.textContent = "T = " + f.T.toFixed(3) + ", step " + f.steps + ", cost " + f.fn(f.x).toFixed(3) +
        ", best " + f.fn(f.best).toFixed(3) + (f.T <= 0.004 ? ", frozen" : "");
    }
  };

  /* ---------- Numerical methods: integrator comparison ---------- */
  specs.integrators = {
    init(f) {
      const input = f.el.querySelector("input");
      const out = f.el.querySelector("output");
      f.h = +input.value;
      input.addEventListener("input", () => { f.h = +input.value; out.textContent = f.h.toFixed(2); f.render(); });
    },
    draw(f) {
      const { ctx, W, H } = f;
      ctx.clearRect(0, 0, W, H);
      const rhs = ([x, v]) => [v, -x];
      const add = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s];
      const methods = {
        Euler: (y, h) => add(y, rhs(y), h),
        Heun: (y, h) => { const k1 = rhs(y), k2 = rhs(add(y, k1, h)); return [y[0] + h / 2 * (k1[0] + k2[0]), y[1] + h / 2 * (k1[1] + k2[1])]; },
        RK4: (y, h) => {
          const k1 = rhs(y), k2 = rhs(add(y, k1, h / 2)), k3 = rhs(add(y, k2, h / 2)), k4 = rhs(add(y, k3, h));
          return [y[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
        }
      };
      const style = { Euler: [C.muted, 1, []], Heun: [C.ink, 1.2, [4, 3]], RK4: [C.accent, 1.8, []] };
      const T = 6 * Math.PI, steps = Math.ceil(T / f.h);
      const cy = H / 2, R = Math.min(H * 0.24, 62), cx = W < 520 ? W * 0.32 : H * 0.62;
      const clip = (x, y) => [cx + x * R, cy - y * R];

      ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - R * 1.9, cy); ctx.lineTo(cx + R * 1.9, cy);
      ctx.moveTo(cx, 6); ctx.lineTo(cx, H - 6); ctx.stroke();

      const drift = {};
      Object.keys(methods).forEach(name => {
        let y = [1, 0];
        const [color, lw, dash] = style[name];
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(...clip(1, 0));
        let drawing = true;
        for (let i = 0; i < steps; i++) {
          y = methods[name](y, f.h);
          if (drawing) ctx.lineTo(...clip(y[0], y[1]));
          if (y[0] * y[0] + y[1] * y[1] > 3.2) drawing = false;
        }
        ctx.stroke(); ctx.restore();
        drift[name] = (y[0] * y[0] + y[1] * y[1]) - 1;
      });

      ctx.font = mono(11); ctx.textBaseline = "middle";
      const lx = W < 520 ? W * 0.62 : cx + R * 2.4;
      Object.keys(methods).forEach((name, i) => {
        const y = cy - 24 + i * 22;
        ctx.strokeStyle = style[name][0]; ctx.lineWidth = style[name][1]; ctx.setLineDash(style[name][2]);
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + 22, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = style[name][0] === C.muted ? C.muted : style[name][0];
        const d = drift[name];
        ctx.fillText(name.padEnd(6) + (Math.abs(d) < 1e-4 ? "≈0" : (d > 0 ? "+" : "") + (d * 100).toFixed(d > 10 ? 0 : 2) + "%"), lx + 30, y);
      });
      f.readout.textContent = "x'' = −x over 3 periods, h = " + f.h.toFixed(2) +
        ", energy drift shown per method, exact orbit is the grey circle";
    }
  };

  document.querySelectorAll("figure.pfig[data-fig]").forEach(el => {
    const spec = specs[el.dataset.fig];
    if (spec) makeFig(el, spec);
  });
})();
