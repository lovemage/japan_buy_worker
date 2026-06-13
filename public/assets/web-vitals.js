/*
 * Lightweight, dependency-free Core Web Vitals collector.
 * Reports LCP / CLS / INP / FCP / TTFB to GA4 as `web_vitals` events.
 *
 * Loaded with `defer` and only attaches passive PerformanceObservers, so it
 * never blocks rendering or interaction. Values are flushed once when the page
 * is backgrounded/unloaded (the point at which CWV are considered final).
 */
(function () {
  "use strict";
  if (typeof PerformanceObserver === "undefined") return;

  // Good/needs-improvement thresholds (web.dev). value below first = good.
  var THRESHOLDS = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] };
  function rate(name, v) {
    var t = THRESHOLDS[name];
    if (!t) return "";
    return v <= t[0] ? "good" : v <= t[1] ? "needs-improvement" : "poor";
  }

  var reported = {};
  function send(name, value) {
    if (reported[name]) return; // one successful report per metric per page load
    // Don't burn the metric if GA hasn't loaded yet — let a later call retry
    // (flush runs again on every visibilitychange→hidden).
    if (typeof window.gtag !== "function") return;
    reported[name] = true;
    var rounded = name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
    window.gtag("event", "web_vitals", {
      metric_name: name,
      metric_value: rounded,
      metric_rating: rate(name, value),
      page_path: location.pathname,
    });
  }

  function observe(type, cb, opts) {
    try {
      var po = new PerformanceObserver(function (list) { cb(list.getEntries(), po); });
      po.observe(Object.assign({ type: type, buffered: true }, opts || {}));
      return po;
    } catch (e) { return null; }
  }

  // ── LCP: largest entry seen, finalised on hide ──
  var lcp = 0;
  observe("largest-contentful-paint", function (entries) {
    var last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });

  // ── FCP ──
  var fcp = 0;
  observe("paint", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].name === "first-contentful-paint") fcp = entries[i].startTime;
    }
  });

  // ── CLS: max session window (gap 1s, cap 5s) ──
  var clsValue = 0, sessionValue = 0, sessionFirst = 0, sessionLast = 0;
  observe("layout-shift", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.hadRecentInput) continue;
      if (sessionValue && e.startTime - sessionLast < 1000 && e.startTime - sessionFirst < 5000) {
        sessionValue += e.value;
        sessionLast = e.startTime;
      } else {
        sessionValue = e.value;
        sessionFirst = e.startTime;
        sessionLast = e.startTime;
      }
      if (sessionValue > clsValue) clsValue = sessionValue;
    }
  });

  // ── INP: worst interaction latency (event timing) ──
  var inp = 0;
  observe("event", function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].interactionId && entries[i].duration > inp) inp = entries[i].duration;
    }
  }, { durationThreshold: 40 });

  // ── TTFB (navigation timing) ──
  var ttfb = 0;
  try {
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.responseStart > 0) ttfb = nav.responseStart;
  } catch (e) {}

  // Send everything captured so far. Runs on each background/unload, and since
  // send() only marks a metric done once gtag has actually fired, an early call
  // (before async GA loaded) is harmlessly retried here.
  function flush() {
    if (ttfb) send("TTFB", ttfb);
    if (fcp) send("FCP", fcp);
    if (lcp) send("LCP", lcp);
    if (inp) send("INP", inp);
    send("CLS", clsValue); // CLS is always meaningful, even when 0
  }

  // Finalise when the page is first backgrounded or unloaded.
  addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  }, { once: false });
  addEventListener("pagehide", flush, { once: true });
})();
