/* Date Diff — pure calendar-day arithmetic (no Date maths), so time zones and DST never shift a day. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var KEY = "datediff.v1";
  var WEEKENDS = { "fri-sat": [5, 6], "sat-sun": [6, 0], "fri": [5], "sun": [0] };   // 0 = Sunday
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var st = { weekend: "fri-sat", op: "+", dText: "", sText: "" };

  function num(v) {
    v = String(v == null ? "" : v)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/[,\s_٬]/g, "");
    return /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
  }

  // ---------- calendar maths on day numbers (days since 1970-01-01) ----------
  function isLeap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
  function dim(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function dfc(o) {
    var y = o.y - (o.m <= 2 ? 1 : 0), era = Math.floor(y / 400), yoe = y - era * 400;
    var doy = Math.floor((153 * (o.m + (o.m > 2 ? -3 : 9)) + 2) / 5) + o.d - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  }
  function cfd(z) {
    z += 719468;
    var era = Math.floor(z / 146097), doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
    var m = mp + (mp < 10 ? 3 : -9);
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m: m, d: doy - Math.floor((153 * mp + 2) / 5) + 1 };
  }
  function wd(z) { return ((z % 7) + 11) % 7; }
  function addMonths(o, k) { var t = o.y * 12 + o.m - 1 + k, y = Math.floor(t / 12), m = t - y * 12 + 1; return { y: y, m: m, d: Math.min(o.d, dim(y, m)) }; }
  function diff(a, b) {
    var months = (b.y - a.y) * 12 + (b.m - a.m), anchor = addMonths(a, months);
    if (dfc(anchor) > dfc(b)) { months--; anchor = addMonths(a, months); }
    return { y: Math.floor(months / 12), m: months % 12, d: dfc(b) - dfc(anchor), months: months };
  }
  // Working days in the half-open range [za, zb).
  function businessDays(za, zb, weekend) {
    var n = zb - za, full = Math.floor(n / 7), count = full * (7 - weekend.length);
    for (var z = za + full * 7; z < zb; z++) if (weekend.indexOf(wd(z)) < 0) count++;
    return count;
  }
  function addBusinessDays(z, n, weekend) {
    var step = n < 0 ? -1 : 1;
    if (weekend.length >= 7) return z;
    for (var left = Math.abs(n); left > 0;) { z += step; if (weekend.indexOf(wd(z)) < 0) left--; }
    return z;
  }
  function parse(v) {
    var m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(v || "");
    if (!m) return null;
    var o = { y: +m[1], m: +m[2], d: +m[3] };
    return o.y >= 1 && o.m >= 1 && o.m <= 12 && o.d >= 1 && o.d <= dim(o.y, o.m) ? o : null;
  }
  function iso(o) { return String(o.y).padStart(4, "0") + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0"); }
  function todayLocal() { var t = new Date(); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; }
  function asDate(o) { var d = new Date(0); d.setUTCFullYear(o.y, o.m - 1, o.d); return d; }
  function nice(o) { return Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(asDate(o)); }
  function hijri(o, locale) {
    try { return Intl.DateTimeFormat((locale || "en") + "-u-ca-islamic-umalqura", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(asDate(o)); }
    catch (e) { return ""; }
  }
  var HP = null;
  function hijriParts(o) {
    try {
      HP = HP || Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });
      var p = {};
      HP.formatToParts(asDate(o)).forEach(function (x) { if (/^(year|month|day)$/.test(x.type)) p[x.type] = parseInt(x.value, 10); });
      return p.year ? { y: p.year, m: p.month, d: p.day } : null;
    } catch (e) { return null; }
  }
  // Hijri → Gregorian: estimate from the mean month length, then search nearby days for an exact match.
  function fromHijri(hy, hm, hd) {
    var est = Math.round(dfc({ y: 622, m: 7, d: 19 }) + (hy - 1) * 354.36707 + (hm - 1) * 29.530589 + hd - 1);
    for (var k = 0; k <= 45; k++) {
      for (var s = -1; s <= 1; s += 2) {
        var z = est + k * s, p = hijriParts(cfd(z));
        if (p && p.y === hy && p.m === hm && p.d === hd) return cfd(z);
        if (!k) break;
      }
    }
    return null;
  }

  // ---------- UI ----------
  function plural(n, w) { return n.toLocaleString() + " " + w + (n === 1 ? "" : "s"); }
  function ymd(a) { return [a.y && plural(a.y, "year"), a.m && plural(a.m, "month"), (a.d || (!a.y && !a.m)) && plural(a.d, "day")].filter(Boolean).join(", "); }
  function stat(label, value) { return '<div class="stat"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }
  function hint(id, o) { $(id).textContent = o ? DAYS[wd(dfc(o))] + " · " + hijri(o) : ""; }
  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === value));
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(b.dataset.v);
      });
    });
  }
  function weekendLabel() { return { "fri-sat": "Fri–Sat", "sat-sun": "Sat–Sun", "fri": "Fri", "sun": "Sun" }[st.weekend]; }

  function renderDiff() {
    var a = parse($("#a").value), b = parse($("#b").value), res = $("#d-res");
    hint("#a-h", a); hint("#b-h", b);
    if (!a || !b) { res.className = "res"; res.innerHTML = "<span>Pick two dates.</span>"; $("#d-stats").innerHTML = ""; st.dText = ""; return; }
    var neg = dfc(b) < dfc(a), lo = neg ? b : a, hi = neg ? a : b, incl = $("#incl").checked;
    var za = dfc(lo), zb = dfc(hi) + (incl ? 1 : 0), days = zb - za;
    var ym = diff(lo, incl ? cfd(zb) : hi), we = WEEKENDS[st.weekend], bd = businessDays(za, zb, we);
    res.className = "res";
    res.innerHTML = "<b>" + S3.esc(plural(days, "day")) + "</b><span>" + S3.esc(ymd(ym)) + (neg ? " · the end date is before the start" : "") + "</span>";
    $("#d-stats").innerHTML = stat("weeks" + (days % 7 ? " + " + plural(days % 7, "day") : ""), Math.floor(days / 7).toLocaleString()) +
      stat("months (whole)", ym.months.toLocaleString()) +
      stat("working days (" + weekendLabel() + " off)", bd.toLocaleString()) +
      stat("weekend days", (days - bd).toLocaleString());
    st.dText = "From " + nice(lo) + " to " + nice(hi) + (incl ? " (inclusive)" : "") + ": " + plural(days, "day") + " (" + ymd(ym) + "), " +
      plural(bd, "working day") + " with " + weekendLabel() + " weekends";
  }

  function renderAdd() {
    var s = parse($("#s").value), n = num($("#n").value), unit = $("#unit").value, res = $("#s-res"), note = $("#s-note");
    hint("#s-h", s); note.textContent = "";
    if (!s || isNaN(n)) { res.className = "res"; res.innerHTML = "<span>Pick a date and an amount.</span>"; st.sText = ""; return; }
    if (n > 1000000) { res.className = "res bad"; res.innerHTML = "<b>That is too far</b>"; st.sText = ""; return; }
    var k = st.op === "-" ? -n : n, z = dfc(s), r;
    if (unit === "d") r = cfd(z + k);
    else if (unit === "w") r = cfd(z + 7 * k);
    else if (unit === "bd") r = cfd(addBusinessDays(z, k, WEEKENDS[st.weekend]));
    else r = addMonths(s, unit === "m" ? k : 12 * k);
    if (r.y < 1 || r.y > 9999) { res.className = "res bad"; res.innerHTML = "<b>Outside years 1–9999</b>"; st.sText = ""; return; }
    if ((unit === "m" || unit === "y") && r.d !== s.d) note.textContent = "Day " + s.d + " does not exist in that month, so it lands on the last day (" + r.d + ").";
    if (unit === "bd") note.textContent = "Skips " + weekendLabel() + " weekends; public holidays are not counted.";
    res.className = "res";
    res.innerHTML = "<b>" + S3.esc(nice(r)) + "</b><span class=\"ar\" dir=\"rtl\" lang=\"ar\">" + S3.esc(hijri(r, "ar-SA")) + "</span><span>" + S3.esc(hijri(r)) +
      " · " + S3.esc(plural(Math.abs(dfc(r) - z), "calendar day")) + (st.op === "-" ? " earlier" : " later") + "</span>";
    st.sText = nice(s) + " " + (st.op === "-" ? "−" : "+") + " " + n + " " + $("#unit").selectedOptions[0].textContent + " = " + nice(r) + " (" + hijri(r) + ")";
  }

  function renderHijri() {
    var hy = num($("#hy").value), hm = +$("#hm").value, hd = num($("#hd").value), res = $("#h-res");
    if (!(hy >= 1 && hd >= 1 && hd <= 30)) { res.className = "res grow hj-res"; res.innerHTML = "<span>Enter a Hijri day and year.</span>"; return; }
    var g = hy >= 1300 && hy <= 1600 ? fromHijri(hy, hm, hd) : null;
    res.className = "res grow hj-res" + (g ? "" : " bad");
    res.innerHTML = g ? "<b>" + S3.esc(nice(g)) + "</b><span>" + S3.esc(iso(g)) + "</span>" :
      "<b>" + (hy >= 1300 && hy <= 1600 ? "That day doesn't exist in this month" : "Supported years: 1300–1600 AH") + "</b>";
  }

  function renderAll() {
    S3.store(KEY, { a: $("#a").value, b: $("#b").value, incl: $("#incl").checked, s: $("#s").value, n: $("#n").value, unit: $("#unit").value,
      op: st.op, weekend: st.weekend, hy: $("#hy").value, hm: $("#hm").value, hd: $("#hd").value });
    renderDiff(); renderAdd(); renderHijri();
  }

  // ---------- wiring ----------
  var sv = S3.store(KEY) || {}, today = todayLocal(), thisHijri = hijriParts(today) || { y: 1448, m: 1, d: 1 };
  $("#a").value = sv.a || iso(today);
  $("#b").value = sv.b || iso({ y: today.y, m: 12, d: 31 });
  $("#incl").checked = !!sv.incl;
  $("#s").value = sv.s || iso(today);
  $("#n").value = sv.n != null ? sv.n : "30";
  $("#unit").value = /^(d|bd|w|m|y)$/.test(sv.unit) ? sv.unit : "d";
  $("#hy").value = sv.hy || thisHijri.y; $("#hm").value = sv.hm || "9"; $("#hd").value = sv.hd || "1";
  st.op = sv.op === "-" ? "-" : "+";
  st.weekend = WEEKENDS[sv.weekend] ? sv.weekend : "fri-sat";
  seg($("#weekend"), st.weekend, function (v) { st.weekend = v; renderAll(); });
  seg($("#op"), st.op, function (v) { st.op = v; renderAll(); });
  $$("#a, #b, #s, #n, #hy, #hd").forEach(function (el) { el.addEventListener("input", renderAll); });
  $$("#incl, #unit, #hm").forEach(function (el) { el.addEventListener("change", renderAll); });
  $("#swap").addEventListener("click", function () { var t = $("#a").value; $("#a").value = $("#b").value; $("#b").value = t; renderAll(); });
  $("#d-copy").addEventListener("click", function () { if (!st.dText) return S3.toast("Pick two dates first", "error"); S3.copy(st.dText); S3.done(); });
  $("#s-copy").addEventListener("click", function () { if (!st.sText) return S3.toast("Pick a date first", "error"); S3.copy(st.sText); S3.done(); });
  renderAll();

  window.S3_DEMO = function () {
    $("#a").value = "2026-10-26"; $("#b").value = "2027-03-31"; $("#incl").checked = false;
    $("#s").value = "2026-10-26"; $("#n").value = "45"; $("#unit").value = "bd";
    $("#weekend button[data-v='fri-sat']").click(); $("#op button[data-v='+']").click();
    $("#hy").value = "1448"; $("#hm").value = "9"; $("#hd").value = "1"; renderAll();
  };

  window.S3_SELFTEST = function () {
    function D(s) { return parse(s); }
    var mon = dfc(D("2026-10-26")), sat = dfc(D("2026-10-31")), y1 = diff(D("2024-02-29"), D("2025-02-28"));
    var g = D("2000-01-01"), h = hijriParts(g), back = h && fromHijri(h.y, h.m, h.d);
    return dfc(D("2026-12-31")) - dfc(D("2026-01-01")) === 364 && dfc(D("2025-01-01")) - dfc(D("2024-01-01")) === 366 &&
      wd(mon) === 1 && wd(dfc(D("1970-01-01"))) === 4 &&
      businessDays(mon, sat, WEEKENDS["sat-sun"]) === 5 && businessDays(mon, sat, WEEKENDS["fri-sat"]) === 4 &&
      businessDays(mon, mon + 14, WEEKENDS["sat-sun"]) === 10 &&
      iso(cfd(addBusinessDays(dfc(D("2026-10-30")), 5, WEEKENDS["sat-sun"]))) === "2026-11-06" &&
      iso(cfd(addBusinessDays(dfc(D("2026-11-06")), -5, WEEKENDS["sat-sun"]))) === "2026-10-30" &&
      iso(addMonths(D("2024-01-31"), 1)) === "2024-02-29" && iso(addMonths(D("2023-01-31"), 1)) === "2023-02-28" &&
      iso(addMonths(D("2024-02-29"), 12)) === "2025-02-28" && iso(addMonths(D("2026-11-15"), -11)) === "2025-12-15" &&
      y1.y === 1 && y1.m === 0 && y1.d === 0 && iso(cfd(dfc(D("1999-12-31")) + 1)) === "2000-01-01" &&
      !!h && h.y === 1420 && h.m === 9 && h.d === 24 && !!back && iso(back) === "2000-01-01";
  };
})();
