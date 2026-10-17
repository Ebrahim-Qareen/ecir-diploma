/* ==========================================================================
   ITGate Academy — eCIR Diploma session engine
   Paged navigation · sidebar with part headings · progress bar · fixed bottom
   nav · keyboard · break timer · MCQ · verify checklists · screenshot slots ·
   terminal sims · scenario player (simx) · SIEM panel playback · stepped
   figures (declarative) · packet-flow player.
   Shared by every session page. Based on the CEH engine; the bottom bar,
   part headings and declarative figures follow the eCDFP pattern.
   ========================================================================== */
(function () {
  'use strict';

  var pages = [], idx = 0;

  document.addEventListener('DOMContentLoaded', function () {
    pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
    if (!pages.length) return;

    buildSidebar();
    buildProgress();
    buildBottomNav();
    wireKeyboard();
    wireTimers();
    wireMCQ();
    wireVerify();
    wireShots();
    wireSims();
    wireSimx();
    wireSiem();
    wireFigures();
    wirePacketFlows();
    wireSixQ();
    wirePlaygrounds();

    var start = parseInt((location.hash || '').replace('#p', ''), 10);
    go(isNaN(start) ? 0 : start - 1, true);
  });

  /* ---------- navigation ---------- */
  function go(n, silent) {
    if (n < 0 || n >= pages.length) return;
    idx = n;
    pages.forEach(function (p, i) { p.classList.toggle('active', i === idx); });

    document.querySelectorAll('#sessionNav li').forEach(function (li, i) {
      li.classList.toggle('now', i === idx);
      li.classList.toggle('seen', i < idx);
    });

    var bar = document.getElementById('progressBar');
    if (bar) bar.style.width = (((idx + 1) / pages.length) * 100) + '%';
    var lbl = document.getElementById('progressLabel');
    if (lbl) lbl.textContent = 'Page ' + (idx + 1) + ' / ' + pages.length;

    var bp = document.getElementById('botPrev'), bn = document.getElementById('botNext'), bc = document.getElementById('botCount');
    if (bp) { bp.classList.toggle('disabled', idx === 0); bp.querySelector('.nt').textContent = idx === 0 ? 'Start' : title(idx - 1); }
    if (bn) { bn.classList.toggle('disabled', idx === pages.length - 1); bn.querySelector('.nt').textContent = idx === pages.length - 1 ? 'End of session' : title(idx + 1); }
    if (bc) bc.textContent = (idx + 1) + ' / ' + pages.length;

    /* things that animate start when their page opens */
    var ap = pages[idx];
    setTimeout(function () {
      ap.querySelectorAll('.sim[data-animate]').forEach(function (s) { if (s.__play && !s.__played) s.__play(); });
      ap.querySelectorAll('.siem[data-animate]').forEach(function (s) { if (s.__play && !s.__played) s.__play(); });
    }, 120);

    if (!silent) history.replaceState(null, '', '#p' + (idx + 1));
    window.scrollTo({ top: 0, behavior: silent ? 'auto' : 'smooth' });
  }
  function title(i) { return pages[i].getAttribute('data-title') || ('Page ' + (i + 1)); }

  function buildSidebar() {
    var nav = document.getElementById('sessionNav');
    if (!nav) return;
    pages.forEach(function (p, i) {
      var li = document.createElement('li');
      if (p.classList.contains('divider')) li.className = 'is-part';
      var a = document.createElement('a');
      a.href = '#p' + (i + 1);
      a.innerHTML = '<span class="n">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span><span>' +
        escapeHtml(p.getAttribute('data-title') || ('Page ' + (i + 1))) + '</span>';
      a.addEventListener('click', function (e) { e.preventDefault(); go(i); });
      li.appendChild(a);
      nav.appendChild(li);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function buildProgress() {
    var host = document.getElementById('progressHost');
    if (!host) return;
    host.innerHTML = '<div class="pbar"><div class="pbar-fill" id="progressBar"></div></div><span class="pbar-label" id="progressLabel"></span>';
  }

  function buildBottomNav() {
    var host = document.getElementById('botnav');
    if (!host) return;
    document.body.classList.add('has-botnav');
    host.className = 'botnav';
    host.innerHTML =
      '<div class="wrap botnav-inner">' +
      '<a href="#" class="nb prev" id="botPrev">&larr; <span class="nt">Start</span></a>' +
      '<div class="mid"><span class="counter" id="botCount"></span>' +
      '<span class="kb"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> to move · <kbd>Home</kbd> <kbd>End</kbd></span></div>' +
      '<a href="#" class="nb next" id="botNext"><span class="nt">Next</span> &rarr;</a></div>';
    document.getElementById('botPrev').addEventListener('click', function (e) { e.preventDefault(); go(idx - 1); });
    document.getElementById('botNext').addEventListener('click', function (e) { e.preventDefault(); go(idx + 1); });
  }

  function wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (document.querySelector('.modal.open')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
      if (e.key === 'Home') { e.preventDefault(); go(0); }
      if (e.key === 'End') { e.preventDefault(); go(pages.length - 1); }
    });
  }

  /* ---------- break timer ---------- */
  function wireTimers() {
    document.querySelectorAll('[data-timer]').forEach(function (host) {
      var total = (parseInt(host.getAttribute('data-timer'), 10) || 15) * 60;
      var left = total, tick = null, running = false;
      var display = host.querySelector('.timer-display'), ring = host.querySelector('.timer-ring-fill');
      var btnS = host.querySelector('[data-act="start"]'), btnR = host.querySelector('[data-act="reset"]'), note = host.querySelector('.timer-note');
      var CIRC = 2 * Math.PI * 54;
      if (ring) { ring.style.strokeDasharray = CIRC; ring.style.strokeDashoffset = 0; }
      render();
      btnS && btnS.addEventListener('click', function () { running ? pause() : start(); });
      btnR && btnR.addEventListener('click', reset);
      function start() { running = true; host.classList.add('running'); host.classList.remove('finished'); btnS.textContent = '⏸ Pause';
        if (note) note.textContent = 'Break in progress — see you back on time.';
        tick = setInterval(function () { left--; if (left <= 0) { left = 0; finish(); } render(); }, 1000); }
      function pause() { running = false; clearInterval(tick); host.classList.remove('running'); btnS.textContent = '▶ Resume'; if (note) note.textContent = 'Paused.'; }
      function reset() { running = false; clearInterval(tick); left = total; host.classList.remove('running', 'finished'); btnS.textContent = '▶ Start break';
        if (note) note.textContent = 'Press start when the break begins.'; render(); }
      function finish() { running = false; clearInterval(tick); host.classList.remove('running'); host.classList.add('finished'); btnS.textContent = '▶ Start break';
        if (note) note.textContent = '⏰ Break is over — welcome back!';
        var n = 0, id = setInterval(function () { host.classList.toggle('flash'); if (++n > 7) { clearInterval(id); host.classList.remove('flash'); } }, 400); }
      function render() { var m = Math.floor(left / 60), s = left % 60;
        if (display) display.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        if (ring) ring.style.strokeDashoffset = CIRC * (1 - left / total);
        host.classList.toggle('warning', left <= 60 && left > 0); }
    });
  }

  /* ---------- MCQ ---------- */
  function wireMCQ() {
    var all = document.querySelectorAll('.q.mcq');
    if (!all.length) return;
    var total = all.length, answered = 0, right = 0;
    var score = document.getElementById('quizScore');
    if (score) score.innerHTML = 'Answered <b>0</b> / ' + total;
    all.forEach(function (q) {
      var correct = q.getAttribute('data-correct'), opts = q.querySelectorAll('.opts li'), fb = q.querySelector('.mcq-fb'), why = q.getAttribute('data-why') || '';
      opts.forEach(function (li) {
        li.addEventListener('click', function () {
          if (q.classList.contains('answered')) return;
          q.classList.add('answered'); answered++;
          if (li.getAttribute('data-opt') === correct) { right++; li.classList.add('correct'); if (fb) { fb.className = 'mcq-fb show ok'; fb.innerHTML = '<b>Correct.</b> ' + why; } }
          else {
            li.classList.add('wrong');
            opts.forEach(function (o) { if (o.getAttribute('data-opt') === correct) o.classList.add('correct'); else if (o !== li) o.classList.add('muted-opt'); });
            if (fb) { fb.className = 'mcq-fb show no'; fb.innerHTML = '<b>Not quite.</b> ' + why; }
          }
          if (score) score.innerHTML = 'Answered <b>' + answered + '</b> / ' + total + ' · Correct <b>' + right + '</b>' +
            (answered === total ? ' — ' + Math.round(right / total * 100) + '%' : '');
        });
      });
    });
  }

  /* ---------- verify checklist (tick each check as you prove it) ---------- */
  function wireVerify() {
    document.querySelectorAll('.verify li').forEach(function (li) {
      li.addEventListener('click', function () { li.classList.toggle('ok'); });
    });
  }

  /* ---------- screenshot slots ----------
     Until the image exists, show a labelled placeholder that says WHAT must be
     captured (data-need) and from WHERE (own lab / THM room).               */
  function wireShots() {
    document.querySelectorAll('.shot img').forEach(function (img) {
      function ph() {
        var name = (img.getAttribute('src') || '').split('/').pop();
        var need = img.getAttribute('data-need') || '';
        var d = document.createElement('div');
        d.className = 'shot-ph';
        d.innerHTML = '🖼 screenshot not added yet<br><b>' + escapeHtml(name) + '</b>' + (need ? '<br>' + escapeHtml(need) : '');
        img.parentNode.replaceChild(d, img);
      }
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) ph();
      else img.addEventListener('error', ph);
    });
  }

  /* ---------- terminal sims: lines reveal in sequence ---------- */
  function wireSims() {
    document.querySelectorAll('.sim[data-animate]').forEach(function (sim) {
      var lines = Array.prototype.slice.call(sim.querySelectorAll('.sim-body .l'));
      var btn = sim.querySelector('.sim-replay'), timers = [];
      function reset() { timers.forEach(clearTimeout); timers = []; lines.forEach(function (l) { l.classList.remove('shown'); }); }
      function play() {
        reset(); sim.__played = true; sim.classList.add('playing'); var t = 0;
        lines.forEach(function (l) { t += l.classList.contains('cmd') ? 320 : 150; timers.push(setTimeout(function () { l.classList.add('shown'); }, t)); });
        timers.push(setTimeout(function () { sim.classList.remove('playing'); }, t + 260));
      }
      sim.__play = play;
      if (btn) btn.addEventListener('click', play);
    });
  }

  /* ---------- SIEM panel: the query runs, then the rows land ---------- */
  function wireSiem() {
    document.querySelectorAll('.siem[data-animate]').forEach(function (s) {
      var rows = Array.prototype.slice.call(s.querySelectorAll('.siem-res tbody tr'));
      var btn = s.querySelector('.siem-replay'), timers = [];
      function play() {
        timers.forEach(clearTimeout); timers = []; s.__played = true;
        s.classList.add('playing'); rows.forEach(function (r) { r.classList.remove('shown'); });
        var t = 450;
        rows.forEach(function (r) { t += 170; timers.push(setTimeout(function () { r.classList.add('shown'); }, t)); });
        timers.push(setTimeout(function () { s.classList.remove('playing'); }, t + 300));
      }
      s.__play = play;
      if (btn) btn.addEventListener('click', play);
    });
  }

  /* ---------- scenario player (simx) ----------
     <div class="simx"> … <ul class="sx-phases"><li data-badge="attack">caption</li>…</ul>
     state via [data-phase=0..N]; IOC chips in a sibling .sx-iocs light up
     (.sx-ioc[data-p]) as the phases pass. Autoplays on view and loops.      */
  function wireSimx() {
    document.querySelectorAll('.simx').forEach(function (sim) {
      var phases = Array.prototype.slice.call(sim.querySelectorAll('.sx-phases li'));
      if (!phases.length) return;
      var n = phases.length, tick = sim.querySelector('.sx-ticker'), badge = tick && tick.querySelector('.sx-badge'),
        cap = tick && tick.querySelector('.sx-cap'), dotsHost = sim.querySelector('.sx-dots'), rep = sim.querySelector('.sx-rep');
      var iocs = [], sib = sim.nextElementSibling;
      if (sib && sib.classList.contains('sx-iocs')) iocs = Array.prototype.slice.call(sib.querySelectorAll('.sx-ioc'));
      if (dotsHost && !dotsHost.children.length) for (var d = 0; d < n; d++) dotsHost.appendChild(document.createElement('i'));
      var dots = dotsHost ? dotsHost.children : [], i = 0, timer = null, played = false;
      function render() {
        var ph = phases[i];
        sim.setAttribute('data-phase', String(i));
        if (cap) cap.textContent = ph.textContent;
        if (badge) { var b = ph.getAttribute('data-badge') || 'norm'; badge.className = 'sx-badge ' + b; badge.textContent = ph.getAttribute('data-label') || b; }
        for (var k = 0; k < dots.length; k++) dots[k].className = (k <= i ? 'on' : '');
        iocs.forEach(function (el) { el.classList.toggle('lit', Number(el.getAttribute('data-p')) <= i); });
      }
      function step() { i = (i + 1) % n; render(); schedule(); }
      function schedule() { clearTimeout(timer); timer = setTimeout(step, i === n - 1 ? 3600 : 2300); }
      function play() { clearTimeout(timer); i = 0; render(); schedule(); }
      if (rep) rep.addEventListener('click', play);
      render();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !played) { played = true; schedule(); } }); }, { threshold: 0.25 }).observe(sim);
      } else schedule();
    });
  }

  /* ---------- stepped figures (declarative) ----------
     <figure class="fig" data-stepped [data-mode="loop|story"] [data-reveal="upto|only"] [data-interval]>
       <div class="fig-head">…</div>
       <div class="fig-body"><svg>… <g data-step="1">…</g> …</svg></div>
       <ol class="fig-steps" hidden><li [data-key]>caption for step 1</li>…</ol>
       <div class="fig-cap"><p></p></div>
     </figure>
     The structure is on screen from frame one; steps change only state.     */
  function wireFigures() {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.fig[data-stepped]').forEach(function (root) {
      var steps = Array.prototype.slice.call(root.querySelectorAll('.fig-steps li'));
      var body = root.querySelector('.fig-body'), capP = root.querySelector('.fig-cap p');
      if (!steps.length || !body || !capP) return;
      var mode = root.getAttribute('data-mode') || 'loop', reveal = root.getAttribute('data-reveal') || 'upto';
      var interval = parseInt(root.getAttribute('data-interval'), 10) || 4200;
      var ctl = document.createElement('div');
      ctl.className = 'fig-ctl';
      ctl.innerHTML = '<button class="fig-btn" type="button" data-a="prev">&larr; Prev</button>' +
        '<button class="fig-btn play" type="button" data-a="play">&#9654; Play</button>' +
        '<button class="fig-btn" type="button" data-a="next">Next &rarr;</button>' +
        '<span class="fig-dots"></span><span class="fig-count"></span>';
      root.insertBefore(ctl, root.querySelector('.fig-cap'));
      var dots = ctl.querySelector('.fig-dots'), countEl = ctl.querySelector('.fig-count'), playBtn = ctl.querySelector('[data-a="play"]');
      steps.forEach(function (s, k) {
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'fig-dot' + (s.hasAttribute('data-key') ? ' k' : '');
        b.setAttribute('aria-label', 'Step ' + (k + 1));
        b.addEventListener('click', function () { stop(); go(k); });
        dots.appendChild(b);
      });
      var i = 0, timer = null, playing = false;
      function paint() {
        body.querySelectorAll('[data-step]').forEach(function (el) {
          var n = parseInt(el.getAttribute('data-step'), 10);
          el.classList.toggle('on', reveal === 'only' ? n === i + 1 : n <= i + 1);
          el.classList.toggle('cur', n === i + 1);
        });
        capP.innerHTML = steps[i].innerHTML;
        root.classList.toggle('key', steps[i].hasAttribute('data-key'));
        Array.prototype.forEach.call(dots.children, function (b, k) { b.classList.toggle('on', k === i); });
        countEl.textContent = (i + 1) + ' / ' + steps.length;
      }
      function go(n) { i = (n + steps.length) % steps.length; paint(); }
      function play() { if (playing || reduced) return; playing = true; playBtn.innerHTML = '&#10073;&#10073; Pause'; timer = setInterval(function () { go(i + 1); }, interval); }
      function stop() { playing = false; playBtn.innerHTML = '&#9654; Play'; if (timer) { clearInterval(timer); timer = null; } }
      ctl.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-a');
        if (a === 'prev') { stop(); go(i - 1); } else if (a === 'next') { stop(); go(i + 1); } else if (a === 'play') { playing ? stop() : play(); }
      });
      go(0);
      if (reduced) {
        body.querySelectorAll('[data-step]').forEach(function (el) { el.classList.add('on'); });
        ctl.hidden = true;
        capP.innerHTML = steps.map(function (s) { return s.innerHTML; }).join(' ');
        return;
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { if (mode === 'loop') { go(0); play(); } } else stop(); });
        }, { threshold: 0.15 }).observe(root);
      } else if (mode === 'loop') play();
    });
  }

  /* ---------- packet-flow player (step through what happens on the wire) ---------- */
  function wirePacketFlows() {
    document.querySelectorAll('.fig.pktflow').forEach(function (fig) {
      var steps = Array.prototype.slice.call(fig.querySelectorAll('.pf-step'));
      if (!steps.length) return;
      var caps = Array.prototype.slice.call(fig.querySelectorAll('.pf-cap')), total = steps.length, cur = 1, timer = null;
      var ctl = fig.querySelector('.pf-ctl'), bPrev = ctl && ctl.querySelector('[data-pf="prev"]'), bNext = ctl && ctl.querySelector('[data-pf="next"]'),
        bPlay = ctl && ctl.querySelector('[data-pf="play"]'), count = ctl && ctl.querySelector('.pf-count');
      function render() {
        steps.forEach(function (g, i) { g.classList.toggle('on', i < cur); });
        caps.forEach(function (c) { c.classList.toggle('open', String(c.getAttribute('data-cap')) === String(cur)); });
        if (count) count.textContent = cur + ' / ' + total;
        if (bPrev) bPrev.disabled = cur <= 1; if (bNext) bNext.disabled = cur === total;
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; } if (bPlay) bPlay.textContent = '▶ Play'; }
      bPrev && bPrev.addEventListener('click', function () { stop(); if (cur > 1) { cur--; render(); } });
      bNext && bNext.addEventListener('click', function () { stop(); if (cur < total) { cur++; render(); } });
      bPlay && bPlay.addEventListener('click', function () {
        if (timer) { stop(); return; } if (cur >= total) cur = 0; bPlay.textContent = '❚❚ Pause';
        timer = setInterval(function () { if (cur >= total) { stop(); return; } cur++; render(); }, 1400);
      });
      render();
    });
  }

  /* ---------- six questions: click a card, its answer shows ---------- */
  function wireSixQ() {
    document.querySelectorAll('.sixq').forEach(function (box) {
      var cards = box.querySelectorAll('.sixq-card'), panes = box.querySelectorAll('.sixq-panel > div');
      function pick(k) {
        cards.forEach(function (c, i) { c.classList.toggle('sel', i === k); });
        panes.forEach(function (p, i) { p.classList.toggle('on', i === k); });
      }
      cards.forEach(function (c, i) { c.addEventListener('click', function () { pick(i); }); });
      pick(0);
    });
  }

  /* ---------- playground: chips switch the output + caption ----------
     <div class="pg"><div class="pg-chips"><button class="pg-chip" data-pg="a">…</button>…</div>
       <div class="pg-out"><div data-pg="a">…</div>…</div><div class="pg-cap"><p data-pg="a">…</p>…</div></div> */
  function wirePlaygrounds() {
    document.querySelectorAll('.pg').forEach(function (pg) {
      var chips = pg.querySelectorAll('.pg-chip');
      function pick(key) {
        chips.forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-pg') === key); });
        pg.querySelectorAll('.pg-out > [data-pg], .pg-cap > [data-pg]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-pg') === key); });
        pg.querySelectorAll('.pg-out > [data-pg="' + key + '"] .siem[data-animate]').forEach(function (s) { if (s.__play) s.__play(); });
      }
      chips.forEach(function (c) { c.addEventListener('click', function () { pick(c.getAttribute('data-pg')); }); });
      if (chips[0]) pick(chips[0].getAttribute('data-pg'));
    });
  }
})();
