/* ==========================================================================
   ITGate eCIR — Animated "How a SIEM Works" diagram
   Auto-plays, or step through manually. Reusable on any page.
   ========================================================================== */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('siemAnim');
    if (!root) return;

    var svg     = root.querySelector('svg');
    var capT    = root.querySelector('.anim-caption b');
    var capP    = root.querySelector('.anim-caption span');
    var dotsBox = root.querySelector('.anim-dots');
    var btnPlay = root.querySelector('[data-a="play"]');
    var btnPrev = root.querySelector('[data-a="prev"]');
    var btnNext = root.querySelector('[data-a="next"]');
    var btnRe   = root.querySelector('[data-a="restart"]');

    /* step definition: which SVG groups light up, where the packet sits */
    var steps = [
      { t: '1 · The attack',
        p: 'An attacker tries password after password against a company machine.',
        on: ['gAttacker', 'aAttack'], packet: null },

      { t: '2 · The log is written',
        p: 'The victim records what happened. Windows writes Event ID 4625 — a failed logon. Linux writes a line to auth.log. Right now this evidence sits alone on each machine.',
        on: ['gAttacker', 'aAttack', 'gWin', 'gLnx', 'gLogs'], packet: null },

      { t: '3 · The agent collects and parses',
        p: 'A small agent on each machine picks up the log and breaks it into fields — user, source IP, time. This is where parsing configuration lives.',
        on: ['gWin', 'gLnx', 'gLogs', 'gAgent', 'aAg1', 'aAg2'], packet: [300, 268] },

      { t: '4 · Shipped to the SIEM',
        p: 'The parsed log travels across the network to the SIEM server, on port 9997. The machine no longer holds the only copy.',
        on: ['gAgent', 'gWire'], packet: [560, 284] },

      { t: '5 · A rule matches',
        p: 'The SIEM normalizes it, stores it, and correlates it with other events. A detection rule is watching: more than ten failures from one source. It matches.',
        on: ['gSiem', 'gRule'], packet: [700, 300], flash: 'gRule' },

      { t: '6 · The analyst investigates',
        p: 'An alert appears on the dashboard. A SOC analyst opens it and starts triage — real threat, or false positive? That analyst is you.',
        on: ['gSiem', 'gAlert', 'gDash', 'gAnalyst'], packet: null }
    ];

    var i = 0, timer = null, playing = false;

    /* build progress dots */
    steps.forEach(function (s, n) {
      var d = document.createElement('span');
      d.className = 'anim-dot';
      d.title = s.t;
      d.addEventListener('click', function () { stop(); show(n); });
      dotsBox.appendChild(d);
    });

    function show(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      var s = steps[i];

      /* reset every group */
      svg.querySelectorAll('.step').forEach(function (el) {
        el.classList.remove('on', 'flash');
      });
      /* light this step's groups */
      s.on.forEach(function (id) {
        var el = svg.querySelector('#' + id);
        if (el) el.classList.add('on');
      });
      if (s.flash) {
        var f = svg.querySelector('#' + s.flash);
        if (f) f.classList.add('flash');
      }

      /* move the travelling log packet */
      var pk = svg.querySelector('#packet');
      if (s.packet) {
        pk.classList.add('on');
        pk.setAttribute('transform', 'translate(' + s.packet[0] + ',' + s.packet[1] + ')');
      } else {
        pk.classList.remove('on');
      }

      capT.textContent = s.t;
      capP.textContent = s.p;

      dotsBox.querySelectorAll('.anim-dot').forEach(function (d, n2) {
        d.classList.toggle('on', n2 === i);
        d.classList.toggle('past', n2 < i);
      });

      btnPrev.disabled = (i === 0);
      btnNext.disabled = (i === steps.length - 1);
    }

    function play() {
      playing = true;
      btnPlay.textContent = '⏸ Pause';
      timer = setInterval(function () {
        if (i >= steps.length - 1) { stop(); return; }
        show(i + 1);
      }, 3400);
    }
    function stop() {
      playing = false;
      btnPlay.textContent = '▶ Play';
      clearInterval(timer);
    }

    btnPlay.addEventListener('click', function () {
      if (playing) { stop(); return; }
      if (i >= steps.length - 1) show(0);
      show(i); play();
    });
    btnPrev.addEventListener('click', function () { stop(); show(i - 1); });
    btnNext.addEventListener('click', function () { stop(); show(i + 1); });
    btnRe.addEventListener('click', function () { stop(); show(0); });

    show(0);
  });
})();
