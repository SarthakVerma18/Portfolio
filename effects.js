/* Small UI effects: link previews and animated numbers. */
(function () {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- hover previews ----------
     Any link pointing at a site we have a screenshot of (the .shot figures)
     shows that screenshot in a small card that follows the cursor. */
  if (matchMedia("(pointer: fine)").matches) {
    const shots = new Map();
    document.querySelectorAll(".shot a").forEach(a => {
      const img = a.querySelector("img");
      if (img) shots.set(a.href, img.getAttribute("src"));
    });

    const peek = document.createElement("div");
    peek.className = "peek";
    peek.setAttribute("aria-hidden", "true");
    peek.innerHTML = "<img alt=''><span></span>";
    document.body.appendChild(peek);
    const peekImg = peek.querySelector("img"), peekLabel = peek.querySelector("span");

    let pos = { x: 0, y: 0 }, raf = 0;
    const place = () => {
      raf = 0;
      const w = peek.offsetWidth, h = peek.offsetHeight;
      let x = pos.x + 18, y = pos.y + 20;
      if (x + w > innerWidth - 12) x = pos.x - w - 18;
      if (y + h > innerHeight - 12) y = pos.y - h - 20;
      peek.style.translate = x + "px " + y + "px";
    };
    const move = e => { pos = { x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(place); };

    document.querySelectorAll("a[href]").forEach(a => {
      if (a.closest(".shot") || !shots.has(a.href)) return;
      a.addEventListener("pointerenter", e => {
        peekImg.src = shots.get(a.href);
        peekLabel.textContent = a.href.replace(/^https?:\/\//, "").replace(/\/$/, "");
        move(e); place();
        peek.classList.add("on");
      });
      a.addEventListener("pointermove", move);
      a.addEventListener("pointerleave", () => peek.classList.remove("on"));
    });
  }

  /* ---------- animated numbers ----------
     Stats count up from zero; ranks count down to their value, the way a
     rank improves. Years and tiny numbers are left alone. */
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  const targets = [];
  const consider = (el, mode) => {
    if (el.children.length) return;
    const m = el.textContent.match(/^(\D*?)(\d[\d,]*)(.*)$/s);
    if (!m) return;
    const value = parseInt(m[2].replace(/,/g, ""), 10);
    if (value < 3 || (!m[2].includes(",") && value >= 1900 && value <= 2100)) return;
    el.classList.add("count");
    targets.push({ el, pre: m[1], post: m[3], value, comma: m[2].includes(","), mode });
  };
  document.querySelectorAll("#work strong").forEach(el => consider(el, "up"));
  document.querySelectorAll(".ranks td.r").forEach(el => consider(el, "down"));

  const fmt = (n, comma) => comma ? n.toLocaleString("en-US") : String(n);
  const ease = t => 1 - Math.pow(1 - t, 3);

  const run = t => {
    const from = t.mode === "down" ? Math.max(t.value * 6, t.value + 60) : 0;
    const dur = t.mode === "down" ? 1100 : 1400;
    const start = performance.now();
    const step = now => {
      const k = Math.min(1, (now - start) / dur);
      const n = Math.round(from + (t.value - from) * ease(k));
      t.el.textContent = t.pre + fmt(n, t.comma) + t.post;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const t = targets.find(t => t.el === e.target);
      if (t) setTimeout(() => run(t), 150);
    });
  }, { threshold: 0.6 });
  targets.forEach(t => io.observe(t.el));
})();
