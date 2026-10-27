(function () {
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- theme ---------- */
  const toggle = document.querySelector(".theme-toggle");
  function applyTheme(next) {
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    lattice.refreshColors();
    background.refreshColors();
    document.dispatchEvent(new Event("themechange"));
  }
  // The new theme spreads out from the toggle like ink, using a view
  // transition clipped to a growing circle. Falls back to an instant swap.
  toggle.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    if (!document.startViewTransition || reduceMotion) { applyTheme(next); return; }
    const b = toggle.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("theme-swap");
    const vt = document.startViewTransition(() => applyTheme(next));
    vt.ready.then(() => {
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + r + "px at " + x + "px " + y + "px)"] },
        { duration: 650, easing: "cubic-bezier(.6, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
    vt.finished.finally(() => root.classList.remove("theme-swap"));
  });

  /* ---------- header state + reading progress ---------- */
  const header = document.querySelector(".top");
  const progress = document.querySelector(".progress");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = root.scrollHeight - innerHeight;
      progress.style.setProperty("--p", max > 0 ? scrollY / max : 0);
      header.classList.toggle("scrolled", scrollY > 8);
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- active section in nav ---------- */
  const navLinks = new Map(
    [...document.querySelectorAll(".top nav a")].map(a => [a.getAttribute("href").slice(1), a])
  );
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      navLinks.forEach(a => a.classList.remove("active"));
      const link = navLinks.get(e.target.id);
      if (link) link.classList.add("active");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  navLinks.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) spy.observe(el);
  });

  /* ---------- reveal on scroll ---------- */
  const revealables = document.querySelectorAll("section > .entry, section > table, section > h2, .now");
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        reveal.unobserve(e.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  revealables.forEach(el => {
    el.classList.add("reveal");
    reveal.observe(el);
  });

  /* ---------- Fig. 1: metasurface lens ----------
     Hexagonal lattice of nanopillars. Each pillar's radius encodes the
     hyperbolic lens phase  phi(r) = k (sqrt(r^2 + f^2) - f)  mod 2pi,
     centred on the focus point. Click switches between two design
     wavelengths, as in the dual-wavelength mode of the real tool. */
  const lattice = (function () {
    const canvas = document.getElementById("lattice");
    const readout = document.getElementById("lattice-readout");
    const ctx = canvas.getContext("2d");

    const PITCH_NM = 600;          // physical lattice pitch
    const FOCAL_UM = 12;           // focal length
    const WAVELENGTHS = [1550, 1310];
    let wl = 0;

    let W = 0, H = 0, dpr = 1, pitch = 18, pillars = [];
    let ink = "#000", accent = "#f00";
    const focus = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    let pointerInside = false, visible = true, running = false, t0 = performance.now();

    function refreshColors() {
      const cs = getComputedStyle(root);
      ink = cs.getPropertyValue("--ink").trim();
      accent = cs.getPropertyValue("--accent").trim();
      if (!running) draw();
    }

    function layout() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      pitch = W < 500 ? 14 : 17;
      const rowH = pitch * Math.sqrt(3) / 2;
      pillars = [];
      for (let j = 0, y = pitch / 2; y < H; j++, y += rowH) {
        for (let x = (j % 2 ? pitch : pitch / 2); x < W; x += pitch) pillars.push(x, y);
      }
      if (!pointerInside) { focus.x = target.x = W / 2; focus.y = target.y = H / 2; }
      draw();
    }

    const umPerPx = () => (PITCH_NM / 1000) / pitch;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const s = umPerPx();
      const lambda = WAVELENGTHS[wl] / 1000;
      const k = 2 * Math.PI / lambda;
      const rMin = pitch * 0.1, rMax = pitch * 0.4;
      const TWO_PI = Math.PI * 2;

      ctx.fillStyle = ink;
      ctx.beginPath();
      for (let i = 0; i < pillars.length; i += 2) {
        const dx = (pillars[i] - focus.x) * s, dy = (pillars[i + 1] - focus.y) * s;
        let phi = k * (Math.sqrt(dx * dx + dy * dy + FOCAL_UM * FOCAL_UM) - FOCAL_UM);
        phi = phi % TWO_PI;
        const r = rMin + (rMax - rMin) * (1 - phi / TWO_PI);
        ctx.moveTo(pillars[i] + r, pillars[i + 1]);
        ctx.arc(pillars[i], pillars[i + 1], r, 0, TWO_PI);
      }
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.globalAlpha = 1;

      // focal marker
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, 7, 0, TWO_PI);
      ctx.moveTo(focus.x - 13, focus.y); ctx.lineTo(focus.x - 9, focus.y);
      ctx.moveTo(focus.x + 9, focus.y);  ctx.lineTo(focus.x + 13, focus.y);
      ctx.moveTo(focus.x, focus.y - 13); ctx.lineTo(focus.x, focus.y - 9);
      ctx.moveTo(focus.x, focus.y + 9);  ctx.lineTo(focus.x, focus.y + 13);
      ctx.stroke();
      ctx.globalAlpha = 1;

      readout.textContent =
        "λ = " + WAVELENGTHS[wl] + " nm · f = " + FOCAL_UM + " µm · pitch " + PITCH_NM +
        " nm · focus (" + ((focus.x - W / 2) * s).toFixed(1) + ", " + ((H / 2 - focus.y) * s).toFixed(1) +
        ") µm · " + (pillars.length / 2) + " pillars";
    }

    function frame(now) {
      if (!visible) { running = false; return; }
      if (!pointerInside) {
        const t = (now - t0) / 1000;
        target.x = W / 2 + Math.sin(t * 0.31) * W * 0.32;
        target.y = H / 2 + Math.sin(t * 0.47 + 1) * H * 0.28;
      }
      focus.x += (target.x - focus.x) * 0.09;
      focus.y += (target.y - focus.y) * 0.09;
      draw();
      requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || running || !visible) return;
      running = true;
      requestAnimationFrame(frame);
    }

    function pointer(e) {
      const rect = canvas.getBoundingClientRect();
      target.x = e.clientX - rect.left;
      target.y = e.clientY - rect.top;
      if (reduceMotion) { focus.x = target.x; focus.y = target.y; draw(); }
    }
    canvas.addEventListener("pointerenter", e => { pointerInside = true; pointer(e); });
    canvas.addEventListener("pointermove", pointer);
    canvas.addEventListener("pointerleave", () => { pointerInside = false; t0 = performance.now() - 3000; });
    canvas.addEventListener("click", () => { wl = (wl + 1) % WAVELENGTHS.length; if (!running) draw(); });

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(canvas);
    new ResizeObserver(layout).observe(canvas);

    refreshColors();
    layout();
    start();
    return { refreshColors };
  })();

  /* ---------- background: graph paper that lenses around the cursor ----------
     Each grid point is pushed radially away from the pointer with a
     Gaussian falloff, like a magnifier sliding over the page. */
  const background = (function () {
    const canvas = document.querySelector(".bg");
    const ctx = canvas.getContext("2d");
    const finePointer = matchMedia("(pointer: fine)").matches;
    const GAP = 34, STEP = 10, SIGMA = 150, PUSH = 0.42;
    let W = 0, H = 0, dpr = 1, rule = "#ccc", accent = "#f00";
    const m = { x: -1e4, y: -1e4 }, target = { x: -1e4, y: -1e4 };
    let strength = 0, goal = 0, raf = 0;

    function refreshColors() {
      const cs = getComputedStyle(root);
      rule = cs.getPropertyValue("--rule").trim();
      accent = cs.getPropertyValue("--accent").trim();
      draw();
    }
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function warp(x, y) {
      const dx = x - m.x, dy = y - m.y;
      const f = strength * PUSH * Math.exp(-(dx * dx + dy * dy) / (SIGMA * SIGMA));
      return [x + dx * f, y + dy * f];
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = rule;
      ctx.globalAlpha = root.dataset.theme === "dark" ? 0.5 : 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const near = x => strength > 0.01 && Math.abs(x - m.x) < SIGMA * 2.5;
      for (let x = (W % GAP) / 2; x <= W; x += GAP) {
        if (!near(x)) { ctx.moveTo(x, 0); ctx.lineTo(x, H); continue; }
        for (let y = 0; y <= H + STEP; y += STEP) {
          const p = warp(x, y);
          y ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
      }
      for (let y = (H % GAP) / 2; y <= H; y += GAP) {
        if (!(strength > 0.01 && Math.abs(y - m.y) < SIGMA * 2.5)) { ctx.moveTo(0, y); ctx.lineTo(W, y); continue; }
        for (let x = 0; x <= W + STEP; x += STEP) {
          const p = warp(x, y);
          x ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (strength > 0.01) {
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, SIGMA);
        g.addColorStop(0, accent + "14");
        g.addColorStop(1, accent + "00");
        ctx.fillStyle = g;
        ctx.fillRect(m.x - SIGMA, m.y - SIGMA, SIGMA * 2, SIGMA * 2);
      }
    }
    function frame() {
      m.x += (target.x - m.x) * 0.16;
      m.y += (target.y - m.y) * 0.16;
      strength += (goal - strength) * 0.08;
      draw();
      const settled = Math.abs(target.x - m.x) < 0.3 && Math.abs(target.y - m.y) < 0.3 && Math.abs(goal - strength) < 0.005;
      raf = settled ? 0 : requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    if (finePointer && !reduceMotion) {
      addEventListener("pointermove", e => {
        if (e.pointerType !== "mouse") return;
        if (goal === 0) { m.x = e.clientX; m.y = e.clientY; }
        target.x = e.clientX; target.y = e.clientY; goal = 1; kick();
      }, { passive: true });
      document.addEventListener("pointerleave", () => { goal = 0; kick(); });
      addEventListener("blur", () => { goal = 0; kick(); });
    }
    addEventListener("resize", resize);
    refreshColors();
    resize();
    return { refreshColors };
  })();
})();
