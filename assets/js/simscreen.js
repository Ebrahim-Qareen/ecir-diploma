/* simscreen.js — the SIMSCREEN engine (from the eCDFP diploma, D95 · D96)
 * eCIR addition: declarative steps — <ol class="ss-steps" hidden><li data-screen data-target [data-key]>caption</li></ol>
 * inside .simscreen are auto-initialised on DOMContentLoaded; no per-page script.
 *
 * A page supplies only its screens (win-ui.css markup) and a steps array.
 * Every hotspot is resolved from the DOM at runtime, so it can never drift
 * from the element it points at (D96 check 7).
 *
 * Markup contract:
 *   <div class="simscreen" data-title="…" data-interval="4600">
 *     <div class="ss-stage"><div class="ss-holder">
 *        <div class="wu" id="scA">…</div>  … one per screen
 *     </div></div>
 *   </div>
 * Steps:
 *   SimScreen.init(rootEl, [{screen:'scA', target:'t1', key:false,
 *                            en:'…', ar:'…'}, …])
 */
(function (w, d) {
  'use strict';
  var CURSOR = '<svg class="ss-cur" viewBox="0 0 20 26" aria-hidden="true">' +
    '<path d="M2 1 L2 20 L7 15.5 L10.5 23.5 L13.5 22 L10 14.5 L17 14 Z" ' +
    'fill="#fff" stroke="#111" stroke-width="1.2"/></svg>';

  function build(root, steps, opts) {
    opts = opts || {};
    var holder = root.querySelector('.ss-holder');
    var stage  = root.querySelector('.ss-stage');
    if (!holder || !steps.length) return null;

    // chrome the page does not have to write
    var mask = d.createElement('div'); mask.className = 'ss-mask'; holder.appendChild(mask);
    var ring = d.createElement('div'); ring.className = 'ss-ring'; holder.appendChild(ring);
    holder.insertAdjacentHTML('beforeend', CURSOR);
    var cur = holder.querySelector('.ss-cur');

    var head = d.createElement('div'); head.className = 'ss-head';
    head.innerHTML = '<span class="ss-title">' + (root.dataset.title || 'SIMSCREEN') +
      '</span><span class="ss-count" aria-live="polite"></span>';
    root.insertBefore(head, stage);

    var cap = d.createElement('div'); cap.className = 'ss-cap';
    cap.innerHTML = '<p></p>'; root.appendChild(cap);

    var ctl = d.createElement('div'); ctl.className = 'ss-ctl';
    ctl.innerHTML =
      '<button class="ss-btn" data-a="prev">&#8592; PREV</button>' +
      '<button class="ss-btn" data-a="play">&#10073;&#10073; PAUSE</button>' +
      '<button class="ss-btn" data-a="next">NEXT &#8594;</button>' +
      '<div class="ss-dots"></div>';
    root.appendChild(ctl);

    var dots = ctl.querySelector('.ss-dots');
    steps.forEach(function (s, n) {
      var b = d.createElement('button');
      b.className = 'ss-dot' + (s.key ? ' k' : '');
      b.type = 'button';
      b.setAttribute('aria-label', 'Step ' + (n + 1) + ' of ' + steps.length);
      b.onclick = function () { go(n); pause(); userPaused = true; };
      dots.appendChild(b);
    });

    var countEl = head.querySelector('.ss-count');
    var capP    = cap.querySelector('p');
    var i = 0, timer = null, playing = false;
    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function place(s) {
      var el = d.getElementById(s.target);
      if (!el) return;
      var h = holder.getBoundingClientRect(), t = el.getBoundingClientRect();
      if (!h.width || !t.width) return;      // hidden screen — measure later
      /* The holder is `zoom`-ed down on narrow screens. getBoundingClientRect()
         returns ZOOMED pixels, but style.left on a child of the holder is read
         in UNZOOMED ones -- so a raw delta gets scaled a second time and the
         pointer lands at z x z of the target. offsetWidth is unzoomed, so the
         ratio between the two recovers z. z === 1 on desktop, so this is exact
         everywhere, not a mobile special case. */
      var z = el.offsetWidth ? (t.width / el.offsetWidth) : 1;
      if (!z || !isFinite(z)) z = 1;
      var x = (t.left - h.left) / z + Math.min(el.offsetWidth, 150) / 2;
      var y = (t.top  - h.top)  / z + el.offsetHeight / 2;
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      /* publish what the pointer is CLAIMING to point at, so the render gate can
         assert the ring actually lands on it (D107). Without this the gate can
         only check "inside the window", which a 30px offset passes. */
      root.dataset.ssTarget = s.target;
      /* the spotlight is drawn in the MASK's coordinate space and the ring in the
         holder's. If those spaces ever drift apart -- an inset on one, an offset
         constant on the other -- the two point at different places and only a
         human notices. Publish the spotlight centre in viewport coordinates so
         the gate can assert they agree. */
      var mr = mask.getBoundingClientRect();
      var mcs = getComputedStyle(mask);
      var mz = mask.offsetWidth ? (mr.width / mask.offsetWidth) : 1;
      if (!mz || !isFinite(mz)) mz = 1;
      root.dataset.ssSpot = Math.round(mr.left + x * mz) + ',' + Math.round(mr.top + y * mz);
      /* the ring's INTENDED centre, in the same coordinates. The rendered ring
         animates over 500ms, so comparing the spotlight against a rendered
         frame measures the transition rather than the maths. These two are
         computed together and are the thing that must agree. */
      var hz = h.width && holder.offsetWidth ? (h.width / holder.offsetWidth) : 1;
      if (!hz || !isFinite(hz)) hz = 1;
      root.dataset.ssRing = Math.round(h.left + x * hz) + ',' + Math.round(h.top + y * hz);
      ring.className  = 'ss-ring' + (s.key ? ' key' : '');
      cur.style.left  = (x + 2) + 'px'; cur.style.top = (y + 1) + 'px';
      /* eCIR: no spotlight — the whole window stays lit (user request,
         2026-10-06). The target is outlined instead, and the click is shown
         as a ripple + cursor press (see click()). */
      mask.style.background = 'none';
      lastXY = [x, y];
      Array.prototype.forEach.call(holder.querySelectorAll('.ss-target'), function (o) {
        if (o !== el) o.classList.remove('ss-target', 'ss-target-key');
      });
      el.classList.add('ss-target');
      el.classList.toggle('ss-target-key', !!s.key);
    }

    function go(n) {
      i = (n + steps.length) % steps.length;
      var s = steps[i];
      Array.prototype.forEach.call(holder.querySelectorAll('.wu'), function (el) {
        el.classList.toggle('on', el.id === s.screen);
      });
      countEl.textContent = (i + 1) + ' / ' + steps.length;
      capP.innerHTML = s.en + (s.ar ? '<span class="ar">' + s.ar + '</span>' : '');
      cap.className = 'ss-cap' + (s.key ? ' key' : '');
      Array.prototype.forEach.call(dots.children, function (b, k) {
        b.classList.toggle('on', k === i);
      });
      w.requestAnimationFrame(function () { place(s); });
      clearTimeout(clickT);
      clickT = setTimeout(function () { click(s); }, 560);   /* after the cursor lands */
    }

    var lastXY = null, clickT = null, userPaused = false;
    function click(s) {
      if (!lastXY || !holder.offsetWidth) return;
      cur.classList.add('press');
      setTimeout(function () { cur.classList.remove('press'); }, 180);
      [0, 140].forEach(function (delay) {
        setTimeout(function () {
          var r = d.createElement('span');
          r.className = 'ss-click' + (s.key ? ' key' : '');
          r.style.left = lastXY[0] + 'px'; r.style.top = lastXY[1] + 'px';
          holder.appendChild(r);
          setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 760);
        }, delay);
      });
    }

    function play() {
      playing = true;
      ctl.querySelector('[data-a=play]').innerHTML = '&#10073;&#10073; PAUSE';
      clearInterval(timer);
      timer = setInterval(function () { go(i + 1); }, +(root.dataset.interval || opts.interval || 4600));
    }
    function pause() {
      playing = false;
      ctl.querySelector('[data-a=play]').innerHTML = '&#9654; PLAY';
      clearInterval(timer);
    }

    ctl.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'next') { go(i + 1); pause(); userPaused = true; }
      else if (a.dataset.a === 'prev') { go(i - 1); pause(); userPaused = true; }
      else if (playing) { pause(); userPaused = true; } else { userPaused = false; play(); }
    });

    // A figure inside a hidden .page measures as 0x0 (D101 — pages are a deck,
    // and only one is displayed). Re-place whenever it becomes visible, or the
    // cursor and ring stay pinned at the corner while the spotlight is correct.
    if (w.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          /* resume autoplay when the page comes back into view, unless the
             student paused it themselves */
          if (e.isIntersecting) { place(steps[i]); if (!playing && !userPaused && !reduced) play(); }
          else if (playing) { pause(); }
        });
      }, { threshold: 0 }).observe(root);
    }
    w.addEventListener('resize', function () { place(steps[i]); });
    w.addEventListener('hashchange', function () {
      w.requestAnimationFrame(function () { place(steps[i]); });
    });
    // belt and braces: the deck may switch screens without a hash change
    if (w.ResizeObserver) {
      new ResizeObserver(function () { place(steps[i]); }).observe(root);
    }

    go(0);
    if (reduced) pause(); else play();
    return { go: go, play: play, pause: pause };
  }

  w.SimScreen = {
    init: function (root, steps, opts) {
      if (typeof root === 'string') root = d.querySelector(root);
      return root ? build(root, steps, opts) : null;
    }
  };

  /* declarative auto-init */
  d.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(d.querySelectorAll('.simscreen'), function (root) {
      var list = root.querySelector('.ss-steps');
      if (!list || root.__ss) return;
      var steps = Array.prototype.map.call(list.querySelectorAll('li'), function (li) {
        return { screen: li.getAttribute('data-screen'), target: li.getAttribute('data-target'),
                 key: li.hasAttribute('data-key'), en: li.innerHTML };
      });
      list.parentNode.removeChild(list);
      root.__ss = build(root, steps, {});
    });
  });
})(window, document);
