(function () {
  "use strict";

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var TRACES = [
    { yFrac: 0.22, amp: 26, beatW: 180, speed: 0.90, opacity: 0.09 },
    { yFrac: 0.55, amp: 36, beatW: 145, speed: 1.35, opacity: 0.11 },
    { yFrac: 0.81, amp: 20, beatW: 200, speed: 0.75, opacity: 0.07 },
  ];

  var VITALS = [
    { label: "\u2665 72 bpm",       dot: "#ef4444" },
    { label: "SpO\u2082 98%",       dot: "#22c55e" },
    { label: "Steps 8,241",    dot: "#3b82f6" },
    { label: "HRV 45 ms",      dot: "#8b5cf6" },
    { label: "Sleep 7.4 h",    dot: "#6366f1" },
    { label: "VO\u2082max 48",      dot: "#0ea5e9" },
    { label: "Stress 28",      dot: "#f59e0b" },
    { label: "Temp 36.8 \u00b0C",   dot: "#ec4899" },
    { label: "RR 14 /min",     dot: "#14b8a6" },
    { label: "Cal 1,842",      dot: "#f97316" },
  ];

  var CHIP_GAP   = 2800;  // ms between chip spawns
  var PULSE_GAP  = 3200;  // ms between pulse spawns
  var CHIP_LIFE  = 240;   // frames (~4 s @ 60 fps)
  var MAX_CHIPS  = 6;
  var MAX_PULSES = 5;

  // ── STATE ─────────────────────────────────────────────────────────────────
  var canvas, ctx, W, H, dpr = 1;
  var scrolls = [0, 0, 0];
  var chips   = [];
  var pulses  = [];
  var chipMs  = 0, pulseMs = 0, lastTs = 0;

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function dark() {
    return document.documentElement.getAttribute("data-theme") !== "light";
  }

  // PQRST waveform — x in any real, returns y in [-1, 1]
  function ecg(x) {
    var t = x - Math.floor(x);
    if (t > 0.08 && t < 0.18) return  0.22 * Math.sin((t - 0.08) / 0.10 * Math.PI);
    if (t > 0.24 && t < 0.27) return -0.14 * Math.sin((t - 0.24) / 0.03 * Math.PI);
    if (t > 0.27 && t < 0.34) return          Math.sin((t - 0.27) / 0.07 * Math.PI); // R spike
    if (t > 0.34 && t < 0.38) return -0.20 * Math.sin((t - 0.34) / 0.04 * Math.PI);
    if (t > 0.40 && t < 0.56) return  0.32 * Math.sin((t - 0.40) / 0.16 * Math.PI); // T wave
    return 0;
  }

  // ── CANVAS ────────────────────────────────────────────────────────────────
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
  }

  // ── ECG TRACES ────────────────────────────────────────────────────────────
  function drawTraces(dt) {
    var color = dark() ? "#3b82f6" : "#1d4ed8";
    TRACES.forEach(function (tr, i) {
      scrolls[i] += tr.speed * dt / 16.67;
      var cy = tr.yFrac * H;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.4;
      ctx.lineJoin    = "round";
      ctx.lineCap     = "round";
      ctx.globalAlpha = tr.opacity;
      ctx.beginPath();
      for (var px = 0; px <= W; px += 2) {
        // right edge of screen = newest tape position
        var tape = scrolls[i] + px - W;
        var y    = cy - ecg(tape / tr.beatW) * tr.amp;
        if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── PULSE RINGS ───────────────────────────────────────────────────────────
  function drawPulses(dt) {
    pulseMs += dt;
    if (pulseMs >= PULSE_GAP && pulses.length < MAX_PULSES) {
      pulses.push({
        x: W * (0.1 + Math.random() * 0.8),
        y: H * (0.1 + Math.random() * 0.8),
        r: 0, maxR: 55 + Math.random() * 70,
        speed: 0.8 + Math.random() * 0.7,
      });
      pulseMs = 0;
    }
    var color = dark() ? "#3b82f6" : "#1d4ed8";
    pulses = pulses.filter(function (p) { return p.r < p.maxR; });
    pulses.forEach(function (p) {
      p.r += p.speed * dt / 16.67;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.globalAlpha = (1 - p.r / p.maxR) * 0.32;
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── VITAL CHIPS ──────────────────────────────────────────────────────────
  function drawChips(dt) {
    chipMs += dt;
    if (chipMs >= CHIP_GAP && chips.length < MAX_CHIPS) {
      var v = VITALS[Math.floor(Math.random() * VITALS.length)];
      chips.push({
        label: v.label, dot: v.dot,
        x:  W * (0.06 + Math.random() * 0.88),
        y:  H * (0.62 + Math.random() * 0.28),
        vy: -(0.30 + Math.random() * 0.42),
        age: 0,
      });
      chipMs = 0;
    }
    var fSize   = 12;
    var textClr = dark() ? "#bfdbfe" : "#1e3a8a";
    var bgClr   = dark() ? "rgba(10,20,50,0.75)"    : "rgba(239,246,255,0.88)";
    var bdClr   = dark() ? "rgba(59,130,246,0.45)"  : "rgba(37,99,235,0.28)";
    chips = chips.filter(function (c) { return c.age < CHIP_LIFE; });
    chips.forEach(function (c) {
      c.age += dt / 16.67;
      c.y   += c.vy * (dt / 16.67);
      var p  = c.age / CHIP_LIFE;
      var a  = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
      a = Math.max(0, Math.min(1, a));
      if (a < 0.01) return;
      ctx.save();
      ctx.font = "600 " + fSize + "px system-ui, sans-serif";
      var tw  = ctx.measureText(c.label).width;
      var px  = 10, py = 6, rad = 8;
      var bw  = tw + px * 2 + 14;
      var bh  = fSize + py * 2;
      var bx  = c.x - bw / 2;
      var by  = c.y - bh / 2;
      ctx.globalAlpha = a;
      // pill background
      ctx.beginPath();
      ctx.moveTo(bx + rad, by);
      ctx.lineTo(bx + bw - rad, by);
      ctx.arcTo(bx + bw, by,      bx + bw, by + rad,      rad);
      ctx.lineTo(bx + bw, by + bh - rad);
      ctx.arcTo(bx + bw, by + bh, bx + bw - rad, by + bh, rad);
      ctx.lineTo(bx + rad, by + bh);
      ctx.arcTo(bx,        by + bh, bx, by + bh - rad,    rad);
      ctx.lineTo(bx, by + rad);
      ctx.arcTo(bx,        by,      bx + rad, by,          rad);
      ctx.closePath();
      ctx.fillStyle   = bgClr;
      ctx.fill();
      ctx.strokeStyle = bdClr;
      ctx.lineWidth   = 1;
      ctx.stroke();
      // colored dot
      ctx.beginPath();
      ctx.arc(bx + px + 4, by + bh / 2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = c.dot;
      ctx.fill();
      // label text
      ctx.fillStyle = textClr;
      ctx.fillText(c.label, bx + px + 14, by + bh / 2 + fSize * 0.36);
      ctx.restore();
    });
  }

  // ── LOOP ─────────────────────────────────────────────────────────────────
  function loop(ts) {
    var dt = lastTs ? Math.min(ts - lastTs, 60) : 16.67;
    lastTs = ts;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    drawTraces(dt);
    drawPulses(dt);
    drawChips(dt);
    ctx.restore();
    requestAnimationFrame(loop);
  }

  // ── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:0;";
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", function () {
      clearTimeout(window.__vtRT);
      window.__vtRT = setTimeout(resize, 150);
    });
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
