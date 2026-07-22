/* ==========================================================================
   ITGate eCIR — Session page engine
   Paged navigation · progress · keyboard · break timer
   ========================================================================== */
(function () {
  'use strict';

  var pages = [], idx = 0;

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
    if (!pages.length) return;

    buildSidebar();
    buildProgress();
    wireButtons();
    wireKeyboard();
    wireTimers();

    var start = parseInt((location.hash || '').replace('#p', ''), 10);
    go(isNaN(start) ? 0 : start - 1, true);
  });

  /* ---------- navigation ---------- */
  function go(n, silent) {
    if (n < 0 || n >= pages.length) return;
    idx = n;

    pages.forEach(function (p, i) { p.classList.toggle('active', i === idx); });

    // sidebar state
    var links = document.querySelectorAll('#sessionNav li');
    links.forEach(function (li, i) {
      li.classList.toggle('now', i === idx);
      li.classList.toggle('seen', i < idx);
    });

    // progress
    var pct = ((idx + 1) / pages.length) * 100;
    var bar = document.getElementById('progressBar');
    if (bar) bar.style.width = pct + '%';
    var lbl = document.getElementById('progressLabel');
    if (lbl) lbl.textContent = 'Page ' + (idx + 1) + ' / ' + pages.length;

    // prev / next labels
    var prev = document.getElementById('btnPrev'), next = document.getElementById('btnNext');
    if (prev) {
      prev.classList.toggle('disabled', idx === 0);
      prev.querySelector('.lbl').textContent = idx === 0 ? '—' : title(idx - 1);
    }
    if (next) {
      next.classList.toggle('disabled', idx === pages.length - 1);
      next.querySelector('.lbl').textContent =
        idx === pages.length - 1 ? 'End of session' : title(idx + 1);
    }

    if (!silent) history.replaceState(null, '', '#p' + (idx + 1));
    window.scrollTo({ top: 0, behavior: silent ? 'auto' : 'smooth' });
  }

  function title(i) { return pages[i].getAttribute('data-title') || ('Page ' + (i + 1)); }

  function buildSidebar() {
    var nav = document.getElementById('sessionNav');
    if (!nav) return;
    pages.forEach(function (p, i) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#p' + (i + 1);
      a.textContent = p.getAttribute('data-title') || ('Page ' + (i + 1));
      a.addEventListener('click', function (e) { e.preventDefault(); go(i); });
      li.appendChild(a);
      nav.appendChild(li);
    });
  }

  function buildProgress() {
    var host = document.getElementById('progressHost');
    if (!host) return;
    host.innerHTML =
      '<div class="pbar"><div class="pbar-fill" id="progressBar"></div></div>' +
      '<span class="pbar-label" id="progressLabel"></span>';
  }

  function wireButtons() {
    var prev = document.getElementById('btnPrev'), next = document.getElementById('btnNext');
    if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); go(idx - 1); });
    if (next) next.addEventListener('click', function (e) { e.preventDefault(); go(idx + 1); });
  }

  function wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
      if (e.key === 'Home') { e.preventDefault(); go(0); }
      if (e.key === 'End') { e.preventDefault(); go(pages.length - 1); }
    });
  }

  /* ---------- break timer ---------- */
  function wireTimers() {
    document.querySelectorAll('[data-timer]').forEach(function (host) {
      var total = (parseInt(host.getAttribute('data-timer'), 10) || 15) * 60; // seconds
      var left = total, tick = null, running = false;

      var display = host.querySelector('.timer-display');
      var ring    = host.querySelector('.timer-ring-fill');
      var btnS    = host.querySelector('[data-act="start"]');
      var btnR    = host.querySelector('[data-act="reset"]');
      var note    = host.querySelector('.timer-note');
      var CIRC    = 2 * Math.PI * 54; // r=54

      if (ring) { ring.style.strokeDasharray = CIRC; ring.style.strokeDashoffset = 0; }
      render();

      btnS && btnS.addEventListener('click', function () { running ? pause() : start(); });
      btnR && btnR.addEventListener('click', reset);

      function start() {
        running = true;
        host.classList.add('running'); host.classList.remove('finished');
        btnS.textContent = '⏸ Pause';
        if (note) note.textContent = 'Break in progress — see you back on time.';
        tick = setInterval(function () {
          left--;
          if (left <= 0) { left = 0; finish(); }
          render();
        }, 1000);
      }
      function pause() {
        running = false; clearInterval(tick);
        host.classList.remove('running');
        btnS.textContent = '▶ Resume';
        if (note) note.textContent = 'Paused.';
      }
      function reset() {
        running = false; clearInterval(tick); left = total;
        host.classList.remove('running', 'finished');
        btnS.textContent = '▶ Start break';
        if (note) note.textContent = 'Press start when the break begins.';
        render();
      }
      function finish() {
        running = false; clearInterval(tick);
        host.classList.remove('running'); host.classList.add('finished');
        btnS.textContent = '▶ Start break';
        if (note) note.textContent = '⏰ Break is over — welcome back!';
        flash();
      }
      function flash() {
        var n = 0, id = setInterval(function () {
          host.classList.toggle('flash'); if (++n > 7) { clearInterval(id); host.classList.remove('flash'); }
        }, 400);
      }
      function render() {
        var m = Math.floor(left / 60), s = left % 60;
        if (display) display.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        if (ring) ring.style.strokeDashoffset = CIRC * (1 - left / total);
        host.classList.toggle('warning', left <= 60 && left > 0);
      }
    });
  }

})();
