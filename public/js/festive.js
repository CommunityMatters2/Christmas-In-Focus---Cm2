// festive.js — the Christmas touches: falling snow, a string of twinkling lights
// under the header, sparkles when a time is picked, and a celebration burst on
// the "You're booked!" page.
//
// Everything is decoration only: it never blocks taps (pointer-events: none),
// pauses when the tab is hidden, and switches off completely for anyone whose
// device asks for reduced motion.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#C9A86A", "#E8CF98", "#8E2C3B", "#B8434F", "#2F5444", "#4F7D66", "#FFFFFF"];

// ---------- string of lights under the header ----------
function addLights() {
  const header = document.querySelector(".site-header");
  if (!header || header.querySelector(".lights")) return;
  const lights = document.createElement("div");
  lights.className = "lights";
  lights.setAttribute("aria-hidden", "true");
  const count = Math.max(10, Math.min(26, Math.round(window.innerWidth / 46)));
  lights.innerHTML = Array.from({ length: count }, (_, i) =>
    `<i style="--i:${i};--d:${(i * 0.37) % 1.9}s"></i>`).join("");
  header.append(lights);
}

// ---------- falling snow ----------
function startSnow() {
  const canvas = document.createElement("canvas");
  canvas.className = "snow";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let w = 0, h = 0, dpr = 1, flakes = [];
  const make = (anyHeight) => ({
    x: Math.random() * w,
    y: anyHeight ? Math.random() * h : -10,
    r: 0.8 + Math.random() * 2.6,
    speed: 0.35 + Math.random() * 0.9,
    drift: Math.random() * Math.PI * 2,
    sway: 0.3 + Math.random() * 0.7,
    alpha: 0.45 + Math.random() * 0.5,
  });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(110, Math.max(40, w / 11)));
    while (flakes.length < target) flakes.push(make(true));
    flakes.length = target;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.drift += 0.01 * dt;
      f.y += f.speed * dt;
      f.x += Math.sin(f.drift) * f.sway * 0.5 * dt;
      if (f.y > h + 10 || f.x < -10 || f.x > w + 10) Object.assign(f, make(false));
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = document.hidden ? 0 : requestAnimationFrame(frame);
  }

  let raf = 0;
  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  raf = requestAnimationFrame(frame);
}

// ---------- little burst of sparkles around an element ----------
export function sparkle(target) {
  if (reduceMotion || !target) return;
  const box = target.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    s.textContent = i % 3 ? "✦" : "❄";
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 34 + Math.random() * 34;
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.color = COLORS[i % 5];
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    document.body.append(s);
    s.addEventListener("animationend", () => s.remove());
  }
}

// ---------- celebration: confetti + snowflakes falling from the top ----------
export function celebrate() {
  if (reduceMotion) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pieces = Array.from({ length: Math.min(180, Math.round(w / 3)) }, () => {
    const fromLeft = Math.random() < 0.5;
    return {
      x: fromLeft ? -10 : w + 10,
      y: h * (0.15 + Math.random() * 0.35),
      vx: (fromLeft ? 1 : -1) * (3 + Math.random() * 7),
      vy: -(6 + Math.random() * 8),
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      star: Math.random() < 0.25,
    };
  });

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = t > 3200 ? Math.max(0, 1 - (t - 3200) / 900) : 1;
    for (const p of pieces) {
      p.vy += 0.22;            // gravity
      p.vx *= 0.985;           // air
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.star) {
        ctx.font = `${p.size * 2}px serif`;
        ctx.fillText("✦", -p.size / 2, p.size / 2);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (t < 4100) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

addLights();
if (!reduceMotion) startSnow();
