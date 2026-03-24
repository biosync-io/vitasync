(function () {
  "use strict";

  // ── Apple-style cinematic scroll reveal ────────────────────────────────────
  // Each element starts invisible, blurred, scaled down, and offset downward.
  // IntersectionObserver triggers a smooth spring-eased reveal as it enters
  // the viewport. Cards in a grid stagger individually.

  var SELECTORS = [
    ".hero",
    ".sl-markdown-content > h2",
    ".sl-markdown-content > h3",
    ".sl-markdown-content > p",
    ".sl-markdown-content > pre",
    ".sl-markdown-content > table",
    ".sl-markdown-content > ul",
    ".sl-markdown-content > ol",
    ".sl-markdown-content > blockquote",
    ".sl-card",                  // each card individually (staggered)
    ".sl-markdown-content > aside",
  ];

  // Elements that only fade (no Y travel) — headings look better with subtler motion
  var FADE_ONLY = new Set([".hero"]);

  function assignClass(el, sel) {
    if (FADE_ONLY.has(sel)) {
      el.classList.add("reveal-fade");
    } else if (el.classList.contains("sl-card")) {
      el.classList.add("reveal-card");
    } else if (el.tagName === "H2" || el.tagName === "H3") {
      el.classList.add("reveal-heading");
    } else if (el.tagName === "PRE" || el.tagName === "TABLE") {
      el.classList.add("reveal-code");
    } else {
      el.classList.add("reveal-item");
    }
  }

  function init() {
    var seen = new WeakSet();
    var allEls = [];

    SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (!seen.has(el)) {
          seen.add(el);
          allEls.push({ el: el, sel: sel });
        }
      });
    });

    if (allEls.length === 0) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -60px 0px" }
    );

    // Stagger cards that share the same parent grid
    var cardDelay = {};

    allEls.forEach(function (item) {
      var el  = item.el;
      var sel = item.sel;

      assignClass(el, sel);

      if (el.classList.contains("reveal-card")) {
        // Identify which grid this card belongs to and stagger within it
        var gridKey = el.parentElement ? el.parentElement.className : "root";
        if (!cardDelay[gridKey]) cardDelay[gridKey] = 0;
        el.style.transitionDelay = cardDelay[gridKey] + "ms";
        cardDelay[gridKey] += 90; // 90 ms between cards
      }

      observer.observe(el);
    });

    // ── Parallax on the hero ──────────────────────────────────────────────
    var hero = document.querySelector(".hero");
    if (hero) {
      function onScroll() {
        var y = window.scrollY || window.pageYOffset;
        hero.style.transform = "translateY(" + (y * 0.18) + "px)";
      }
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-run on Astro View Transitions navigation
  document.addEventListener("astro:page-load", init);
})();
