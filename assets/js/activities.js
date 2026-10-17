/* ITGate eCIR — activities engine
   Games after every topic, simple CTF challenges, a personal flag scoreboard
   and an optional class team board. Data-driven by HTML attributes.
   Types (div.act[data-act]): sort · match · order · choice · calc · spot
   CTF: div.ctf[data-id][data-h] (answer checked by hash — not by plain text)
   Storage: localStorage, per session; every read/write is wrapped. */
(function () {
  'use strict';

  var SID = (document.body && document.body.getAttribute('data-session')) || 's00';
  var KEY = 'itg-' + SID + '-flags', TKEY = 'itg-' + SID + '-teams';
  var got = load(KEY, {}), registry = [], byId = {};

  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked — the page still works */ } }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* small non-crypto hash (cyrb53) — keeps CTF answers out of plain sight */
  function h53(str) {
    var h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
    for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function norm(s) { return String(s || '').toLowerCase().trim().replace(/^itg\{/, '').replace(/\}$/, '').replace(/\s+/g, '').replace(/%$/, ''); }

  document.addEventListener('DOMContentLoaded', function () {
    $$('.act').forEach(initAct);
    $$('.ctf').forEach(initCtf);
    buildBoard();
    $$('.teamboard').forEach(renderTeams);
    $$('.flag-summary').forEach(renderSummary);
    $$('.ctf-set').forEach(updateSet);
    $$('.thm').forEach(initThm);
    initReveal();
  });

  /* ---------- reveal: each top-level block rises in when it scrolls into view ---------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function (es) {
      var k = 0;
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; el.style.transitionDelay = Math.min(k++ * 70, 350) + 'ms';
        el.classList.add('in'); io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; }, 1000);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    $$('.page:not(.divider) .content > *').forEach(function (el) {
      if (el.matches('.kicker, h1')) return;
      el.classList.add('rv'); io.observe(el);
    });
  }

  /* ---------------- TryHackMe reference figures ----------------
     The files live in Instructor_Only\THM_refs\<dir>\ next to docs\ on the instructor's disk.
     Each image tries the known relative paths; a figure with no loaded image stays hidden. */
  var THM_BASES = ['../../../Instructor_Only/THM_refs/', '../../Instructor_Only/THM_refs/'];
  function initThm(fig) {
    if (location.protocol !== 'file:') { fig.parentNode.removeChild(fig); return; }  /* public site: never shown */
    var dir = fig.getAttribute('data-thm-dir') || '';
    $$('img[data-thm]', fig).forEach(function (img) {
      var k = 0, box = img.closest('.thm-i');
      function next() {
        if (k >= THM_BASES.length) { if (box) box.classList.add('gone'); return; }
        img.src = THM_BASES[k++] + dir + '/' + img.getAttribute('data-thm');
      }
      img.addEventListener('load', function () { fig.classList.add('ok'); });
      img.addEventListener('error', next);
      img.addEventListener('click', function () {
        var z = el('div', 'thm-zoom'); var i = el('img'); i.src = img.src; i.alt = img.alt; z.appendChild(i);
        z.addEventListener('click', function () { z.remove(); }); document.body.appendChild(z);
      });
      next();
    });
  }

  /* ---------------- registry / capture ---------------- */
  function pageOf(node) { var p = node.closest('.page'); return p ? p.getAttribute('data-title') : ''; }
  function register(id, name, pts, node, kind) {
    if (!id || byId[id]) return;
    var r = { id: id, name: name || id, pts: pts, node: node, kind: kind, page: pageOf(node) };
    registry.push(r); byId[id] = r;
  }
  function capture(id, label) {
    var first = !got[id];
    got[id] = Date.now(); save(KEY, got);
    refreshBoard();
    $$('.flag-summary').forEach(renderSummary);
    $$('.ctf-set').forEach(updateSet);
    if (first) toast('🚩 Flag captured' + (label ? ' — ' + label : ''));
  }
  function score() {
    var n = 0, p = 0, tn = registry.length, tp = 0;
    registry.forEach(function (r) { tp += r.pts; if (got[r.id]) { n++; p += r.pts; } });
    return { n: n, p: p, tn: tn, tp: tp };
  }

  /* ---------------- toast ---------------- */
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = el('div', 'act-toast'); toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  /* ---------------- activity shell ---------------- */
  function initAct(a) {
    var type = a.getAttribute('data-act'), id = a.getAttribute('data-flag-id'), flag = a.getAttribute('data-flag') || '';
    register(id, a.getAttribute('data-flag-name'), Number(a.getAttribute('data-pts') || 10), a, 'act');
    var foot = $('.act-foot', a);
    if (!foot) { foot = el('div', 'act-foot'); a.appendChild(foot); }
    var needCheck = /^(sort|match|order|calc)$/.test(type);
    if (needCheck) foot.appendChild(el('button', 'act-btn primary act-check', '✓ Check'));
    foot.appendChild(el('button', 'act-btn act-reset', '↺ Reset'));
    foot.appendChild(el('span', 'act-msg'));
    $$('button', foot).forEach(function (b) { b.type = 'button'; });
    var flagBox = el('div', 'act-flag'); flagBox.hidden = true;
    flagBox.innerHTML = '<span class="af-i">🚩</span><span class="af-t">Flag captured</span><code>' + esc(flag) + '</code>';
    a.appendChild(flagBox);
    var api = ({ sort: sortAct, match: matchAct, order: orderAct, choice: choiceAct, calc: calcAct, spot: spotAct }[type] || function () { return {}; })(a);
    a.__win = function () {
      if (a.classList.contains('won')) return;
      a.classList.add('won'); msg(a, '✓ All correct', 'ok');
      $$('.act-why', a).forEach(function (w) { w.hidden = false; });
      flagBox.hidden = false; capture(id, a.getAttribute('data-flag-name'));
    };
    var chk = $('.act-check', a); if (chk) chk.addEventListener('click', function () { api.check && api.check(); });
    $('.act-reset', a).addEventListener('click', function () {
      a.classList.remove('won'); msg(a, '', ''); $$('.act-why', a).forEach(function (w) { w.hidden = true; });
      flagBox.hidden = !got[id]; api.reset && api.reset();
    });
    if (got[id]) { flagBox.hidden = false; a.classList.add('was-won'); }
    wireTimer(a);
  }
  function msg(a, t, k) { var m = $('.act-msg', a); if (!m) return; m.textContent = t; m.className = 'act-msg' + (k ? ' ' + k : ''); }

  function wireTimer(a) {
    var sec = Number(a.getAttribute('data-time') || 0), h = $('.act-h', a); if (!sec || !h) return;
    var b = el('button', 'act-timer'), left = sec, t = null; b.type = 'button';
    function fmt() { var m = Math.floor(left / 60), s = left % 60; b.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s; }
    fmt(); h.insertBefore(b, $('.act-n', h));
    b.addEventListener('click', function () {
      if (t) { clearInterval(t); t = null; b.classList.remove('run'); return; }
      if (left <= 0) { left = sec; b.classList.remove('done'); }
      b.classList.add('run');
      t = setInterval(function () { left--; fmt(); if (left <= 0) { clearInterval(t); t = null; b.classList.remove('run'); b.classList.add('done'); b.textContent = '⏱ Time!'; } }, 1000);
    });
  }

  /* ---------------- sort: cards into bins ---------------- */
  function sortAct(a) {
    var pool = $('.act-pool', a), cards = $$('.act-card', a), bins = $$('.act-bin', a), sel = null;
    function unsel() { if (sel) sel.classList.remove('sel'); sel = null; }
    function clear() { cards.forEach(function (c) { c.classList.remove('ok', 'bad'); }); if (!a.classList.contains('won')) msg(a, '', ''); }
    function put(target) { if (!sel) return; target.appendChild(sel); unsel(); clear(); }
    function reset() { unsel(); shuffle(cards.slice()).forEach(function (c) { pool.appendChild(c); }); clear(); }
    cards.forEach(function (c) {
      c.type = 'button'; c.setAttribute('draggable', 'true');
      c.addEventListener('click', function (e) { e.stopPropagation(); if (sel === c) { unsel(); return; } unsel(); sel = c; c.classList.add('sel'); });
      c.addEventListener('dragstart', function (e) { unsel(); sel = c; c.classList.add('sel'); try { e.dataTransfer.setData('text/plain', 'card'); } catch (x) {} });
      c.addEventListener('dragend', function () { $$('.over', a).forEach(function (o) { o.classList.remove('over'); }); });
    });
    function zone(z, target) {
      z.addEventListener('click', function () { put(target); });
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
      z.addEventListener('dragleave', function () { z.classList.remove('over'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); put(target); });
    }
    bins.forEach(function (b) { zone(b, $('.act-drop', b)); });
    zone(pool, pool);
    reset();
    return {
      reset: reset,
      check: function () {
        var left = $$('.act-card', pool).length;
        if (left) { msg(a, 'Place every card first — ' + left + ' left.', 'warn'); return; }
        var bad = 0;
        cards.forEach(function (c) { var ok = c.closest('.act-bin').getAttribute('data-bin') === c.getAttribute('data-bin'); c.classList.toggle('ok', ok); c.classList.toggle('bad', !ok); if (!ok) bad++; });
        if (bad) msg(a, bad + ' in the wrong place — move the red ones.', 'bad'); else a.__win();
      }
    };
  }

  /* ---------------- match: connect left to right with lines ---------------- */
  function matchAct(a) {
    var box = $('.mt', a), L = $$('.mt-l .mt-item', a), R = $$('.mt-r .mt-item', a), rcol = $('.mt-r', a);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'mt-svg'); box.appendChild(svg);
    var pairs = {}, cur = null, state = {};
    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var br = box.getBoundingClientRect(); if (!br.width) return;
      svg.setAttribute('viewBox', '0 0 ' + br.width + ' ' + br.height);
      Object.keys(pairs).forEach(function (lk) {
        var l = L[lk], r = R[pairs[lk]], lr = l.getBoundingClientRect(), rr = r.getBoundingClientRect();
        var x1 = lr.right - br.left, y1 = lr.top + lr.height / 2 - br.top, x2 = rr.left - br.left, y2 = rr.top + rr.height / 2 - br.top;
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var mx = (x1 + x2) / 2;
        p.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2);
        p.setAttribute('class', 'mt-line' + (state[lk] ? ' ' + state[lk] : ''));
        svg.appendChild(p);
        [[x1, y1], [x2, y2]].forEach(function (pt) { var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', 4); c.setAttribute('class', 'mt-dot' + (state[lk] ? ' ' + state[lk] : '')); svg.appendChild(c); });
      });
    }
    function paint() {
      L.forEach(function (l, i) { l.classList.toggle('paired', pairs[i] != null); l.classList.toggle('sel', cur === i); l.classList.remove('ok', 'bad'); if (state[i]) l.classList.add(state[i]); });
      var used = {}; Object.keys(pairs).forEach(function (k) { used[pairs[k]] = k; });
      R.forEach(function (r, j) { r.classList.toggle('paired', used[j] != null); r.classList.remove('ok', 'bad'); if (used[j] != null && state[used[j]]) r.classList.add(state[used[j]]); });
      draw();
    }
    L.forEach(function (l, i) {
      l.type = 'button';
      l.addEventListener('click', function () { if (pairs[i] != null && cur !== i) { delete pairs[i]; state = {}; } cur = (cur === i) ? null : i; msgClear(); paint(); });
    });
    R.forEach(function (r, j) {
      r.type = 'button';
      r.addEventListener('click', function () {
        if (cur == null) { msg(a, 'Pick an item on the left first.', 'warn'); return; }
        Object.keys(pairs).forEach(function (k) { if (pairs[k] === j) delete pairs[k]; });
        pairs[cur] = j; cur = null; state = {}; msgClear(); paint();
      });
    });
    function msgClear() { if (!a.classList.contains('won')) msg(a, '', ''); }
    function reset() { pairs = {}; cur = null; state = {}; shuffle(R.slice()).forEach(function (r) { rcol.appendChild(r); }); paint(); }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(box); else window.addEventListener('resize', draw);
    reset();
    return {
      reset: reset,
      check: function () {
        var n = Object.keys(pairs).length;
        if (n < L.length) { msg(a, 'Connect every item first — ' + (L.length - n) + ' left.', 'warn'); return; }
        var bad = 0; state = {};
        Object.keys(pairs).forEach(function (k) { var ok = L[k].getAttribute('data-k') === R[pairs[k]].getAttribute('data-k'); state[k] = ok ? 'ok' : 'bad'; if (!ok) bad++; });
        paint();
        if (bad) msg(a, bad + ' wrong line' + (bad > 1 ? 's' : '') + ' — click a red item to reconnect it.', 'bad'); else a.__win();
      }
    };
  }

  /* ---------------- order: put steps in sequence ---------------- */
  function orderAct(a) {
    var list = $('.act-order', a), items = $$('li', list), drag = null;
    items.forEach(function (li) {
      var t = el('span', 'ord-t'); while (li.firstChild) t.appendChild(li.firstChild);
      li.appendChild(el('span', 'ord-n')); li.appendChild(t);
      var b = el('span', 'ord-b'), up = el('button', 'ord-up', '▲'), dn = el('button', 'ord-dn', '▼');
      up.type = dn.type = 'button'; up.setAttribute('aria-label', 'Move up'); dn.setAttribute('aria-label', 'Move down');
      b.appendChild(up); b.appendChild(dn); li.appendChild(b);
      up.addEventListener('click', function () { var p = li.previousElementSibling; if (p) list.insertBefore(li, p); after(); });
      dn.addEventListener('click', function () { var n = li.nextElementSibling; if (n) list.insertBefore(n, li); after(); });
      li.setAttribute('draggable', 'true');
      li.addEventListener('dragstart', function (e) { drag = li; li.classList.add('drag'); try { e.dataTransfer.setData('text/plain', 'li'); } catch (x) {} });
      li.addEventListener('dragend', function () { li.classList.remove('drag'); drag = null; after(); });
      li.addEventListener('dragover', function (e) {
        e.preventDefault(); if (!drag || drag === li) return;
        var r = li.getBoundingClientRect(); list.insertBefore(drag, (e.clientY - r.top) > r.height / 2 ? li.nextSibling : li);
      });
    });
    function nums() { $$('li', list).forEach(function (li, i) { $('.ord-n', li).textContent = i + 1; }); }
    function after() { $$('li', list).forEach(function (li) { li.classList.remove('ok', 'bad'); }); if (!a.classList.contains('won')) msg(a, '', ''); nums(); }
    function reset() {
      var s; do { s = shuffle(items.slice()); } while (s.every(function (li, i) { return Number(li.getAttribute('data-pos')) === i + 1; }) && items.length > 1);
      s.forEach(function (li) { list.appendChild(li); }); after();
    }
    reset();
    return {
      reset: reset,
      check: function () {
        var bad = 0;
        $$('li', list).forEach(function (li, i) { var ok = Number(li.getAttribute('data-pos')) === i + 1; li.classList.toggle('ok', ok); li.classList.toggle('bad', !ok); if (!ok) bad++; });
        if (bad) msg(a, bad + ' out of place — the green ones are already right.', 'bad'); else a.__win();
      }
    };
  }

  /* ---------------- choice: scenario questions (optionally one at a time) ---------------- */
  function choiceAct(a) {
    var qs = $$('.ch', a), seq = a.hasAttribute('data-seq');
    qs.forEach(function (q) {
      var correct = q.getAttribute('data-correct'), fb = $('.ch-fb', q);
      if (!fb) { fb = el('div', 'ch-fb'); q.appendChild(fb); }
      $$('.ch-opts button', q).forEach(function (b) {
        b.type = 'button';
        b.addEventListener('click', function () {
          if (q.classList.contains('done')) return;
          if (b.getAttribute('data-o') === correct) {
            b.classList.add('ok'); q.classList.add('done');
            fb.className = 'ch-fb ok'; fb.innerHTML = '✓ ' + (b.getAttribute('data-why') || q.getAttribute('data-why') || 'Correct.');
            var nxt = qs[qs.indexOf(q) + 1]; if (seq && nxt) { nxt.hidden = false; }
            if (qs.every(function (x) { return x.classList.contains('done'); })) a.__win();
            else { var d = qs.filter(function (x) { return x.classList.contains('done'); }).length; msg(a, d + ' / ' + qs.length + ' done', ''); }
          } else {
            b.classList.add('bad');
            fb.className = 'ch-fb bad'; fb.innerHTML = '✗ ' + (b.getAttribute('data-why') || 'Not this one — read the case again and try another answer.');
          }
        });
      });
    });
    function reset() {
      qs.forEach(function (q, i) { q.classList.remove('done'); $$('.ch-opts button', q).forEach(function (b) { b.classList.remove('ok', 'bad'); }); var fb = $('.ch-fb', q); fb.className = 'ch-fb'; fb.innerHTML = ''; q.hidden = seq && i > 0; });
    }
    reset();
    return { reset: reset };
  }

  /* ---------------- calc: numeric answers ---------------- */
  function calcAct(a) {
    var ins = $$('input[data-ans]', a);
    ins.forEach(function (i) { i.addEventListener('input', function () { i.classList.remove('ok', 'bad'); }); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('.act-check', a).click(); } }); });
    return {
      reset: function () { ins.forEach(function (i) { i.value = ''; i.classList.remove('ok', 'bad'); }); },
      check: function () {
        var bad = 0, empty = 0;
        ins.forEach(function (i) {
          var v = parseFloat(String(i.value).replace(',', '.').replace('%', '')), ans = parseFloat(i.getAttribute('data-ans')), tol = parseFloat(i.getAttribute('data-tol') || '0');
          if (i.value.trim() === '') { empty++; return; }
          var ok = !isNaN(v) && Math.abs(v - ans) <= tol; i.classList.toggle('ok', ok); i.classList.toggle('bad', !ok); if (!ok) bad++;
        });
        if (empty) msg(a, 'Fill every box first.', 'warn'); else if (bad) msg(a, bad + ' not right yet — check the start and end times.', 'bad'); else a.__win();
      }
    };
  }

  /* ---------------- spot: click the suspicious fields ---------------- */
  function spotAct(a) {
    var sp = $$('.sp', a), bad = sp.filter(function (s) { return s.hasAttribute('data-bad'); }), log = $('.spot-log', a), cnt = el('span', 'spot-cnt');
    var h = $('.act-h', a); if (h) h.insertBefore(cnt, $('.act-n', h));
    function upd() { var f = bad.filter(function (s) { return s.classList.contains('found'); }).length; cnt.textContent = 'found ' + f + ' / ' + bad.length; if (f === bad.length) a.__win(); }
    sp.forEach(function (s) {
      s.setAttribute('role', 'button'); s.setAttribute('tabindex', '0');
      function hit() {
        if (s.hasAttribute('data-bad')) {
          if (s.classList.contains('found')) return;
          s.classList.add('found');
          if (log && s.getAttribute('data-why')) { var li = el('li', '', s.getAttribute('data-why')); log.appendChild(li); }
          upd();
        } else { s.classList.remove('miss'); void s.offsetWidth; s.classList.add('miss'); msg(a, s.getAttribute('data-why') || 'That one looks normal.', 'warn'); }
      }
      s.addEventListener('click', hit);
      s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(); } });
    });
    upd();
    return { reset: function () { sp.forEach(function (s) { s.classList.remove('found', 'miss'); }); if (log) log.innerHTML = ''; upd(); } };
  }

  /* ---------------- CTF challenge ---------------- */
  function initCtf(c) {
    var id = c.getAttribute('data-id'), hs = (c.getAttribute('data-h') || '').split(','), pts = Number(c.getAttribute('data-pts') || 20);
    register(id, c.getAttribute('data-name'), pts, c, 'ctf');
    var f = $('.ctf-f', c), inp = $('input', f), m = $('.ctf-msg', c), why = $('.ctf-why', c), tries = 0;
    function solved(silent) {
      c.classList.add('solved'); inp.disabled = true; $('button', f).disabled = true;
      m.className = 'ctf-msg ok'; m.innerHTML = '🚩 Correct — flag captured <b>+' + pts + '</b>';
      if (why) why.hidden = false;
      if (!silent) capture(id, c.getAttribute('data-name'));
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = norm(inp.value); if (!v) return;
      if (hs.indexOf(h53(SID + ':' + id + ':' + v)) >= 0) solved(false);
      else { tries++; m.className = 'ctf-msg bad'; m.textContent = '✗ Not quite (try ' + tries + '). Check the evidence and the answer format.'; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
    });
    if (got[id]) solved(true);
  }
  function updateSet(s) {
    var cs = $$('.ctf', s), n = cs.filter(function (c) { return got[c.getAttribute('data-id')]; }).length, p = $('.ctf-prog', s);
    if (p) p.innerHTML = '<b>' + n + '</b> / ' + cs.length + ' solved';
    s.classList.toggle('all', n === cs.length && cs.length > 0);
  }

  /* ---------------- floating scoreboard ---------------- */
  var fab, panel;
  function buildBoard() {
    if (!registry.length) return;
    fab = el('button', 'flag-fab'); fab.type = 'button'; fab.setAttribute('aria-label', 'Open the flag scoreboard');
    panel = el('div', 'flag-panel'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Flag scoreboard');
    panel.innerHTML = '<div class="fp-h"><b>🚩 Scoreboard</b><div class="fp-tabs"><button type="button" data-tab="me" class="on">My flags</button><button type="button" data-tab="team">Class teams</button></div><button type="button" class="fp-x" aria-label="Close">✕</button></div>' +
      '<div class="fp-body" data-tab="me"><div class="fp-sum"></div><ol class="fp-list"></ol><button type="button" class="act-btn fp-reset">↺ Reset my flags</button></div>' +
      '<div class="fp-body" data-tab="team" hidden><div class="teamboard"></div></div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    fab.addEventListener('click', function () { panel.hidden = !panel.hidden; if (!panel.hidden) refreshBoard(); });
    $('.fp-x', panel).addEventListener('click', function () { panel.hidden = true; });
    $$('.fp-tabs button', panel).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.fp-tabs button', panel).forEach(function (x) { x.classList.toggle('on', x === b); });
        $$('.fp-body', panel).forEach(function (x) { x.hidden = x.getAttribute('data-tab') !== b.getAttribute('data-tab'); });
      });
    });
    $('.fp-reset', panel).addEventListener('click', function () {
      if (!confirmInline(this)) return;
      got = {}; save(KEY, got); location.reload();
    });
    renderTeams($('.teamboard', panel));
    refreshBoard();
  }
  function confirmInline(btn) {
    if (btn.getAttribute('data-sure')) return true;
    btn.setAttribute('data-sure', '1'); btn.textContent = 'Click again to confirm';
    setTimeout(function () { btn.removeAttribute('data-sure'); btn.textContent = '↺ Reset my flags'; }, 3000);
    return false;
  }
  function gotoPage(node) {
    var pages = $$('.page'), i = pages.indexOf(node.closest('.page')), links = $$('#sessionNav li a');
    if (i >= 0 && links[i]) links[i].click();
    if (panel) panel.hidden = true;
    setTimeout(function () { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350);
  }
  function refreshBoard() {
    if (!fab) return;
    var s = score();
    fab.innerHTML = '<span>🚩</span><b>' + s.n + '</b><i>/ ' + s.tn + '</i>';
    fab.classList.toggle('full', s.n === s.tn);
    if (!panel) return;
    $('.fp-sum', panel).innerHTML = '<div class="fp-big"><b>' + s.p + '</b><span>points</span></div><div class="fp-big"><b>' + s.n + ' / ' + s.tn + '</b><span>flags</span></div><div class="fp-rank">' + rank(s) + '</div>';
    var ol = $('.fp-list', panel); ol.innerHTML = '';
    registry.forEach(function (r) {
      var li = el('li', got[r.id] ? 'got' : '', '<span class="fl-k">' + (r.kind === 'ctf' ? 'CTF' : 'GAME') + '</span><span class="fl-n">' + esc(r.name) + '</span><span class="fl-p">' + (got[r.id] ? '✓ ' : '') + r.pts + '</span>');
      li.addEventListener('click', function () { gotoPage(r.node); });
      ol.appendChild(li);
    });
  }
  function rank(s) {
    var q = s.tp ? s.p / s.tp : 0;
    if (q >= 1) return '🏆 SOC Ready — every flag captured';
    if (q >= 0.75) return '🛡️ Tier 2 material';
    if (q >= 0.4) return '🔎 Tier 1 on shift';
    if (q > 0) return '🎓 Trainee — keep going';
    return 'Solve a game or a CTF to earn your first flag';
  }
  function renderSummary(box) {
    var s = score();
    box.innerHTML = '<div class="fs-row"><div class="fs-k"><b>' + s.p + '</b><span>of ' + s.tp + ' points</span></div><div class="fs-k"><b>' + s.n + ' / ' + s.tn + '</b><span>flags</span></div></div><div class="fs-bar"><i style="width:' + (s.tp ? Math.round(100 * s.p / s.tp) : 0) + '%"></i></div><p class="fs-rank">' + rank(s) + '</p>' +
      (s.n < s.tn ? '<p class="fs-note">Open the 🚩 button (bottom right) to see which flags are still missing and jump to them.</p>' : '');
  }

  /* ---------------- class team board ---------------- */
  var teams = load(TKEY, null) || [{ n: 'Team Alpha', s: 0 }, { n: 'Team Bravo', s: 0 }, { n: 'Team Charlie', s: 0 }];
  function renderTeams(box) {
    if (!box) return;
    box.innerHTML = '';
    var max = Math.max.apply(null, teams.map(function (t) { return t.s; }).concat([0]));
    teams.forEach(function (t, i) {
      var row = el('div', 'tb-row' + (t.s > 0 && t.s === max ? ' lead' : ''));
      row.innerHTML = '<input class="tb-n" aria-label="Team name" value="' + esc(t.n) + '"><span class="tb-s">' + t.s + '</span><button type="button" class="tb-b" data-d="-5">−5</button><button type="button" class="tb-b" data-d="5">+5</button><button type="button" class="tb-b" data-d="10">+10</button>';
      $('.tb-n', row).addEventListener('change', function () { t.n = this.value || ('Team ' + (i + 1)); save(TKEY, teams); syncTeams(); });
      $$('.tb-b', row).forEach(function (b) { b.addEventListener('click', function () { t.s = Math.max(0, t.s + Number(b.getAttribute('data-d'))); save(TKEY, teams); syncTeams(); }); });
      box.appendChild(row);
    });
    var r = el('button', 'act-btn tb-reset', '↺ Reset team points'); r.type = 'button';
    r.addEventListener('click', function () { teams.forEach(function (t) { t.s = 0; }); save(TKEY, teams); syncTeams(); });
    box.appendChild(r);
  }
  function syncTeams() { $$('.teamboard').forEach(renderTeams); }
})();
