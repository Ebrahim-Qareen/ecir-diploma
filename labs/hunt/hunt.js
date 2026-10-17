/* ITGate eCIR — Hunt explorer: a tiny in-browser "mini-SIEM".
   It speaks a small part of SPL so the same search works in Splunk.
   Data: data/gN.js sets window.HUNT.gN = {f:[fields], r:[[row], ...]} (works on file:// too);
   a sparse file uses s:[[fieldIndex, value, fieldIndex, value, ...], ...]. Lookup tables: window.HUNT_LOOKUP.name = {f, r}.
   Markup: <div class="hx" data-game="g1" [data-index="main"] [data-key="f1,f2"] [data-examples="q1||q2"] [data-src="data/nc.js"] [data-newest]>
   Inside a .hunt-game it is built when that game is picked; anywhere else it is built on load (Session 4).
   Session 4 additions: index=/host=/sourcetype=/source= filter when the rows carry that field; earliest=/latest= (absolute times);
   ( ) groups with OR; rex (named groups); eval + where expressions (if, case, coalesce, round, len, lower, upper, replace, substr,
   tonumber, tostring, strftime, cidrmatch, match, like, mvcount, mvindex, isnull, isnotnull, abs, floor, ceiling, min, max);
   bin/bucket _time span=; timechart span= count [by f]; chart; eventstats; lookup <name> <field> [AS <field>] OUTPUT <fields>;
   reverse; fields - a b; fillnull. */
(function () {
  'use strict';
  var H = window.HUNT = window.HUNT || {};
  var PAGE = 50;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function isNum(v) { return v !== null && v !== '' && !isNaN(Number(v)) && typeof v !== 'boolean'; }
  function show(v) { if (v === null || v === undefined) return ''; if (Array.isArray(v)) return v.join(', '); return String(v); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtT(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z'; }
  function copyRow(o) { var n = {}; for (var k in o) n[k] = o[k]; return n; }

  /* ---------------- data loading ---------------- */
  var cache = {};
  function load(id, cb, src) {
    if (cache[id]) return cb(null, cache[id]);
    function ready() {
      var d = H[id], f = d.f, out = [], sp = !!d.s, R = sp ? d.s : d.r;
      for (var i = 0; i < R.length; i++) {
        var row = R[i], o = {}, parts = [];
        for (var j = 0; j < (sp ? row.length : f.length); j += (sp ? 2 : 1)) {
          var k = sp ? f[row[j]] : f[j], v = sp ? row[j + 1] : row[j];
          if (v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
          o[k] = v; parts.push(show(v));
        }
        o._t = Date.parse(o.timestamp + (/Z$|[+-]\d\d:\d\d$/.test(o.timestamp) ? '' : 'Z'));
        o._time = o.timestamp;
        o._s = parts.join(' \u0001 ').toLowerCase();
        out.push(o);
      }
      cache[id] = { rows: out, fields: f.slice() };
      cb(null, cache[id]);
    }
    if (H[id]) return ready();
    var s = document.createElement('script');
    s.src = src || ('data/' + id + '.js');
    s.onload = function () { if (H[id]) ready(); else cb('The data file did not load.'); };
    s.onerror = function () { cb('The data file did not load. Check your connection and refresh.'); };
    document.head.appendChild(s);
  }

  /* ---------------- query parsing ---------------- */
  function splitPipes(q) {
    var out = [], cur = '', inq = false, depth = 0;
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (c === '"' && q[i - 1] !== '\\') inq = !inq;
      if (!inq && c === '[') depth++;
      if (!inq && c === ']') depth--;
      if (c === '|' && !inq && depth <= 0) { out.push(cur.trim()); cur = ''; } else cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  function toks(s) { return s.match(/(?:[^\s"(),]+|"(?:[^"\\]|\\.)*"|\((?:[^()"]|"(?:[^"\\]|\\.)*"|\([^()]*\))*\))+|,/g) || []; }
  function unq(v) { v = String(v); if (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'); return v; }
  function wild(v) {
    var lv = String(v).toLowerCase();
    if (lv.indexOf('*') < 0) return function (x) { return x === lv; };
    var re = new RegExp('^' + lv.split('*').map(function (p) { return p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('[\\s\\S]*') + '$');
    return function (x) { return re.test(x); };
  }
  /* scope fields: filter when the rows carry the field (Session 4 data), ignore otherwise (the hunts' data has none) */
  var SCOPE = { index: 1, sourcetype: 1, source: 1 };
  function parseTime(v) {
    v = unq(v);
    if (/^\d{9,13}$/.test(v)) return Number(v) * (v.length <= 10 ? 1000 : 1);
    var m = /^(\d\d)\/(\d\d)\/(\d{4}):(\d\d):(\d\d):(\d\d)$/.exec(v);           // Splunk's %m/%d/%Y:%H:%M:%S
    if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
    var t = Date.parse(v + (/Z$|[+-]\d\d:\d\d$/.test(v) || !/T|\d{4}-\d\d-\d\d/.test(v) ? '' : 'Z'));
    if (!isNaN(t)) return t;
    throw new Error('earliest/latest: use an absolute time, e.g. earliest="2026-10-07T02:00:00" or 10/07/2026:02:00:00');
  }
  function predicate(tok) {
    if (tok.length > 1 && tok[0] === '(' && tok[tok.length - 1] === ')') return compileSearch(tok.slice(1, -1));
    var m = /^([A-Za-z_][\w.:-]*)\s*(!=|>=|<=|=|>|<)([\s\S]*)$/.exec(tok);
    if (m) {
      var f = m[1], op = m[2], raw = unq(m[3]), lf = f.toLowerCase();
      if ((lf === 'earliest' || lf === 'latest') && op === '=') {
        var tt = parseTime(m[3]);
        return lf === 'earliest' ? function (o) { return o._t >= tt; } : function (o) { return o._t < tt; };
      }
      if (op === '=' || op === '!=') {
        var t = wild(raw);
        var hit = function (o) {
          var v = o[f]; if (v === undefined || v === null) return false;
          if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (t(String(v[i]).toLowerCase())) return true; return false; }
          return t(String(v).toLowerCase());
        };
        if (SCOPE[lf] && op === '=') return function (o) { return o[f] === undefined ? true : hit(o); };
        if (op === '=') return hit;
        return function (o) { return o[f] !== undefined && o[f] !== null && !hit(o); };
      }
      var num = isNum(raw), rv = num ? Number(raw) : raw.toLowerCase();
      return function (o) {
        var v = o[f]; if (v === undefined || v === null) return false;
        var a = num && isNum(v) ? Number(v) : String(v).toLowerCase();
        return op === '>' ? a > rv : op === '<' ? a < rv : op === '>=' ? a >= rv : a <= rv;
      };
    }
    var w = unq(tok).toLowerCase();
    if (w.indexOf('*') < 0) return function (o) { return o._s.indexOf(w) >= 0; };
    var re = new RegExp(w.split('*').map(function (p) { return p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('[^\\u0001]*'));
    return function (o) { return re.test(o._s); };
  }
  function compileSearch(s) {
    var t = toks(s), clauses = [], neg = false, orNext = false;
    for (var i = 0; i < t.length; i++) {
      var k = t[i];
      if (k === ',') continue;
      if (k === 'NOT') { neg = true; continue; }
      if (k === 'OR') { orNext = true; continue; }
      if (k === 'AND') continue;
      var mi = /^([A-Za-z_][\w.:-]*)\s+IN\s*(\(.*\))$/i.exec(k) || (t[i + 1] && /^IN$/i.test(t[i + 1]) && t[i + 2] && t[i + 2][0] === '(' ? [0, k, t[i + 2]] : null);
      if (mi) { if (mi[0] === 0) i += 2; var fld = mi[1], vals = toks(mi[2].slice(1, -1)).filter(function (x) { return x !== ','; }); var ps = vals.map(function (v) { return predicate(fld + '=' + v); }); var pIn = function (o) { for (var j = 0; j < ps.length; j++) if (ps[j](o)) return true; return false; }; if (neg) { var q1 = pIn; pIn = function (o) { return !q1(o); }; neg = false; } if (orNext && clauses.length) clauses[clauses.length - 1].push(pIn); else clauses.push([pIn]); orNext = false; continue; }
      var p = predicate(k);
      if (!p) { neg = false; orNext = false; continue; }
      if (neg) { var pp = p; p = function (o) { return !pp(o); }; neg = false; }
      if (orNext && clauses.length) clauses[clauses.length - 1].push(p); else clauses.push([p]);
      orNext = false;
    }
    return function (o) {
      if (!o._s) o._s = Object.keys(o).map(function (k) { return k[0] === '_' && k !== '_raw' ? '' : show(o[k]); }).join(' \u0001 ').toLowerCase();
      for (var i = 0; i < clauses.length; i++) {
        var c = clauses[i], ok = false;
        for (var j = 0; j < c.length; j++) if (c[j](o)) { ok = true; break; }
        if (!ok) return false;
      }
      return true;
    };
  }
  function fieldList(t) { return t.filter(function (x) { return x !== ','; }).map(unq); }

  /* ---------------- eval / where expressions ---------------- */
  function lex(s) {
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") { var j = i + 1, str = ''; while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { str += s[j + 1]; j += 2; } else { str += s[j]; j++; } } out.push({ t: 'str', v: str }); i = j + 1; continue; }
      if ((m = /^\d+(\.\d+)?/.exec(s.slice(i)))) { out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
      if ((m = /^(==|!=|<=|>=|&&|\|\||[-+*\/%.<>=(),!])/.exec(s.slice(i)))) { out.push({ t: 'op', v: m[1] === '&&' ? 'AND' : m[1] === '||' ? 'OR' : m[1] }); i += m[1].length; continue; }
      if ((m = /^[A-Za-z_][\w.:]*/.exec(s.slice(i)))) { var w = m[0]; if (/^(AND|OR|NOT|LIKE)$/.test(w)) out.push({ t: 'op', v: w.toUpperCase() }); else out.push({ t: 'id', v: w }); i += w.length; continue; }
      throw new Error('eval: I do not understand "' + s.slice(i, i + 12) + '"');
    }
    return out;
  }
  function num(v) { if (Array.isArray(v)) v = v[0]; var n = Number(v); return v === null || v === undefined || v === '' || isNaN(n) ? NaN : n; }
  function str(v) { return v === null || v === undefined ? '' : show(v); }
  function truthy(v) { return !(v === null || v === undefined || v === false || v === 0 || v === '' || (typeof v === 'number' && isNaN(v))); }
  function cmpv(a, b) { if (isNum(a) && isNum(b)) return Number(a) - Number(b); return str(a).toLowerCase() < str(b).toLowerCase() ? -1 : str(a).toLowerCase() > str(b).toLowerCase() ? 1 : 0; }
  function strftime(ms, f) {
    var d = new Date(ms); if (isNaN(ms)) return null;
    return f.replace(/%([YmdHMSjaAbBpIy%])/g, function (_, k) {
      switch (k) {
        case 'Y': return d.getUTCFullYear(); case 'y': return String(d.getUTCFullYear()).slice(2); case 'm': return pad(d.getUTCMonth() + 1); case 'd': return pad(d.getUTCDate());
        case 'H': return pad(d.getUTCHours()); case 'M': return pad(d.getUTCMinutes()); case 'S': return pad(d.getUTCSeconds()); case 'I': return pad(d.getUTCHours() % 12 || 12);
        case 'p': return d.getUTCHours() < 12 ? 'AM' : 'PM'; case 'a': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
        case 'A': return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
        case 'b': return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
        case 'B': return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
        case 'j': return String(Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1); case '%': return '%';
      }
      return '';
    });
  }
  function cidr(block, ip) {
    var p = String(block).split('/'), bits = Number(p[1]); if (!p[1] || isNaN(bits)) return false;
    function toN(a) { var q = String(a).split('.'); if (q.length !== 4) return NaN; return q.reduce(function (acc, x) { return acc * 256 + Number(x); }, 0); }
    var a = toN(p[0]), b = toN(ip); if (isNaN(a) || isNaN(b)) return false;
    var mask = bits === 0 ? 0 : Math.pow(2, 32) - Math.pow(2, 32 - bits);
    return Math.floor(a / Math.pow(2, 32 - bits)) === Math.floor(b / Math.pow(2, 32 - bits)) && mask >= 0;
  }
  var FN = {
    'if': function (a, o) { return truthy(a[0]) ? a[1] : a[2]; },
    'case': function (a) { for (var i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1]; return null; },
    coalesce: function (a) { for (var i = 0; i < a.length; i++) if (a[i] !== null && a[i] !== undefined && a[i] !== '') return a[i]; return null; },
    round: function (a) { var n = num(a[0]), d = a.length > 1 ? num(a[1]) : 0; if (isNaN(n)) return null; var k = Math.pow(10, d || 0); return Math.round(n * k) / k; },
    tonumber: function (a) { var n = num(a[0]); return isNaN(n) ? null : n; }, tostring: function (a) { return a[0] === null || a[0] === undefined ? null : str(a[0]); },
    lower: function (a) { return str(a[0]).toLowerCase(); }, upper: function (a) { return str(a[0]).toUpperCase(); }, len: function (a) { return str(a[0]).length; },
    trim: function (a) { return str(a[0]).trim(); },
    replace: function (a) { return str(a[0]).replace(new RegExp(str(a[1]), 'g'), str(a[2])); },
    substr: function (a) { var s = str(a[0]), st = num(a[1]), n = a.length > 2 ? num(a[2]) : undefined; st = st > 0 ? st - 1 : s.length + st; return n === undefined ? s.slice(st) : s.slice(st, st + n); },
    strftime: function (a) { var v = a[0]; var ms = isNum(v) && Number(v) > 1e9 ? Number(v) * (Number(v) < 1e11 ? 1000 : 1) : Date.parse(str(v) + (/Z$|[+-]\d\d:\d\d$/.test(str(v)) ? '' : 'Z')); return strftime(ms, str(a[1])); },
    cidrmatch: function (a) { return cidr(a[0], a[1]); },
    match: function (a) { try { return new RegExp(str(a[1])).test(str(a[0])); } catch (e) { throw new Error('match(): bad regex'); } },
    like: function (a) { var re = new RegExp('^' + str(a[1]).replace(/[.+?^${}()|[\]\\*]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); return re.test(str(a[0])); },
    mvcount: function (a) { return a[0] === null || a[0] === undefined ? null : Array.isArray(a[0]) ? a[0].length : 1; },
    mvindex: function (a) { var v = Array.isArray(a[0]) ? a[0] : [a[0]], i = num(a[1]); if (i < 0) i += v.length; return v[i] === undefined ? null : v[i]; },
    mvjoin: function (a) { return (Array.isArray(a[0]) ? a[0] : [a[0]]).join(str(a[1])); },
    isnull: function (a) { return a[0] === null || a[0] === undefined; }, isnotnull: function (a) { return !(a[0] === null || a[0] === undefined); },
    abs: function (a) { return Math.abs(num(a[0])); }, floor: function (a) { return Math.floor(num(a[0])); }, ceiling: function (a) { return Math.ceil(num(a[0])); }, ceil: function (a) { return Math.ceil(num(a[0])); },
    min: function (a) { return a.slice().sort(cmpv)[0]; }, max: function (a) { return a.slice().sort(cmpv)[a.length - 1]; },
    'true': function () { return true; }, 'false': function () { return false; }, 'null': function () { return null; }
  };
  function parseExpr(tokens) {
    var i = 0;
    function peek() { return tokens[i]; }
    function take(v) { var t = tokens[i]; if (v !== undefined && (!t || t.v !== v)) throw new Error('eval: expected "' + v + '"' + (t ? ' before "' + t.v + '"' : '')); i++; return t; }
    function isOp(v) { var t = tokens[i]; return t && t.t === 'op' && t.v === v; }
    function orX() { var l = andX(); while (isOp('OR')) { take(); var r = andX(); l = (function (a, b) { return function (o) { return truthy(a(o)) || truthy(b(o)); }; })(l, r); } return l; }
    function andX() { var l = notX(); while (isOp('AND')) { take(); var r = notX(); l = (function (a, b) { return function (o) { return truthy(a(o)) && truthy(b(o)); }; })(l, r); } return l; }
    function notX() { if (isOp('NOT') || isOp('!')) { take(); var e = notX(); return function (o) { return !truthy(e(o)); }; } return cmpX(); }
    function cmpX() {
      var l = addX();
      while (peek() && peek().t === 'op' && /^(==|=|!=|<|>|<=|>=|LIKE)$/.test(peek().v)) {
        var op = take().v, r = addX();
        l = (function (a, b, op) {
          return function (o) {
            var x = a(o), y = b(o);
            if (op === 'LIKE') return FN.like([x, y]);
            var c = cmpv(x, y);
            if (op === '==' || op === '=') return isNum(x) && isNum(y) ? Number(x) === Number(y) : str(x).toLowerCase() === str(y).toLowerCase();
            if (op === '!=') return !(isNum(x) && isNum(y) ? Number(x) === Number(y) : str(x).toLowerCase() === str(y).toLowerCase());
            if (x === null || x === undefined || y === null || y === undefined) return false;
            return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
          };
        })(l, r, op);
      }
      return l;
    }
    function addX() {
      var l = mulX();
      while (peek() && peek().t === 'op' && /^[-+.]$/.test(peek().v)) {
        var op = take().v, r = mulX();
        l = (function (a, b, op) {
          return function (o) {
            var x = a(o), y = b(o);
            if (op === '.') return str(x) + str(y);
            if (op === '+' && !(isNum(x) && isNum(y))) return (x === null || x === undefined) && (y === null || y === undefined) ? null : str(x) + str(y);
            var nx = num(x), ny = num(y); if (isNaN(nx) || isNaN(ny)) return null;
            return op === '+' ? nx + ny : nx - ny;
          };
        })(l, r, op);
      }
      return l;
    }
    function mulX() {
      var l = unX();
      while (peek() && peek().t === 'op' && /^[*\/%]$/.test(peek().v)) {
        var op = take().v, r = unX();
        l = (function (a, b, op) { return function (o) { var x = num(a(o)), y = num(b(o)); if (isNaN(x) || isNaN(y)) return null; return op === '*' ? x * y : op === '/' ? (y === 0 ? null : x / y) : x % y; }; })(l, r, op);
      }
      return l;
    }
    function unX() { if (isOp('-')) { take(); var e = unX(); return function (o) { var v = num(e(o)); return isNaN(v) ? null : -v; }; } return atom(); }
    function atom() {
      var t = take();
      if (!t) throw new Error('eval: the expression ends too early');
      if (t.t === 'num') return function () { return t.v; };
      if (t.t === 'str') return function () { return t.v; };
      if (t.t === 'op' && t.v === '(') { var e = orX(); take(')'); return e; }
      if (t.t === 'id') {
        if (isOp('(')) {
          take('(');
          var args = [];
          if (!isOp(')')) { args.push(orX()); while (isOp(',')) { take(); args.push(orX()); } }
          take(')');
          var fn = FN[t.v.toLowerCase()];
          if (!fn) throw new Error('eval: unknown function ' + t.v + '()');
          return function (o) { return fn(args.map(function (a) { return a(o); }), o); };
        }
        var name = t.v;
        if (name === '_time') return function (o) { return o._t !== undefined ? Math.floor(o._t / 1000) : (o._time ? Math.floor(Date.parse(o._time + (/Z$/.test(o._time) ? '' : 'Z')) / 1000) : null); };
        return function (o) { var v = o[name]; return v === undefined ? null : v; };
      }
      throw new Error('eval: unexpected "' + t.v + '"');
    }
    var e = orX();
    if (i < tokens.length) throw new Error('eval: unexpected "' + tokens[i].v + '"');
    return e;
  }
  function compileExpr(s) { return parseExpr(lex(s)); }

  /* ---------------- commands ---------------- */
  function cmp(a, b) {
    if (a === undefined || a === null || a === '') return (b === undefined || b === null || b === '') ? 0 : 1;
    if (b === undefined || b === null || b === '') return -1;
    if (isNum(a) && isNum(b)) return Number(a) - Number(b);
    return String(a).localeCompare(String(b));
  }
  function aggregate(rows, spec) {
    var f = spec.f, vals = [];
    if (spec.fn === 'count' && !f) return rows.length;
    rows.forEach(function (o) { var v = o[f]; if (v === undefined || v === null) return; if (Array.isArray(v)) vals = vals.concat(v); else vals.push(v); });
    switch (spec.fn) {
      case 'count': return vals.length;
      case 'dc': case 'distinct_count': var s = {}; vals.forEach(function (v) { s[String(v).toLowerCase()] = 1; }); return Object.keys(s).length;
      case 'sum': return round(vals.reduce(function (a, v) { return a + (Number(v) || 0); }, 0));
      case 'avg': case 'mean': return vals.length ? round(vals.reduce(function (a, v) { return a + (Number(v) || 0); }, 0) / vals.length) : null;
      case 'min': return vals.length ? vals.slice().sort(cmp)[0] : null;
      case 'max': return vals.length ? vals.slice().sort(cmp)[vals.length - 1] : null;
      case 'range': return vals.length ? round(Number(vals.slice().sort(cmp)[vals.length - 1]) - Number(vals.slice().sort(cmp)[0])) : null;
      case 'stdev': if (vals.length < 2) return null; var mn = vals.reduce(function (a, v) { return a + (Number(v) || 0); }, 0) / vals.length; return round(Math.sqrt(vals.reduce(function (a, v) { return a + Math.pow((Number(v) || 0) - mn, 2); }, 0) / (vals.length - 1)));
      case 'median': if (!vals.length) return null; var sv = vals.map(Number).sort(function (a, b) { return a - b; }); return sv[Math.floor(sv.length / 2)];
      case 'earliest': case 'first': return vals.length ? vals[0] : null;
      case 'latest': case 'last': return vals.length ? vals[vals.length - 1] : null;
      case 'values': var u = {}; vals.forEach(function (v) { u[String(v)] = 1; }); return Object.keys(u).sort().slice(0, 50).join('\n');
      case 'list': return vals.slice(0, 50).map(String).join('\n');
    }
    throw new Error('Unknown function: ' + spec.fn + '()');
  }
  function round(x) { return Math.round(x * 1000) / 1000; }
  function groupBy(rows, by) {
    /* like Splunk: an event whose by-field is multivalue counts once in EVERY value's group */
    var g = {}, order = [];
    function add(keyv, o) {
      var k = JSON.stringify(keyv.map(function (v) { return show(v); }));
      if (!g[k]) { g[k] = { key: keyv, rows: [] }; order.push(k); }
      g[k].rows.push(o);
    }
    rows.forEach(function (o) {
      var vals = by.map(function (b) { return o[b]; });
      if (vals.some(function (v) { return v === undefined || v === null; })) return;
      var combos = [[]];
      vals.forEach(function (v) {
        var opts = Array.isArray(v) ? v : [v], next = [];
        combos.forEach(function (c) { opts.forEach(function (x) { next.push(c.concat([x])); }); });
        combos = next;
      });
      combos.forEach(function (c) { add(c, o); });
    });
    return order.map(function (k) { return g[k]; });
  }
  function parseAggs(args) {
    var t = toks(args), aggs = [], by = [], i = 0;
    for (; i < t.length; i++) {
      var k = t[i];
      if (k === ',') continue;
      if (k.toLowerCase() === 'by') { by = fieldList(t.slice(i + 1)); break; }
      var m = /^(\w+)(?:\(([^)]*)\))?$/.exec(k);
      if (!m) throw new Error('stats: I do not understand "' + k + '"');
      var spec = { fn: m[1].toLowerCase(), f: m[2] ? unq(m[2].trim()) : null };
      spec.name = spec.f ? spec.fn + '(' + spec.f + ')' : spec.fn;
      if (t[i + 1] && t[i + 1].toLowerCase() === 'as' && t[i + 2]) { spec.name = unq(t[i + 2]); i += 2; }
      aggs.push(spec);
    }
    if (!aggs.length) aggs.push({ fn: 'count', f: null, name: 'count' });
    return { aggs: aggs, by: by };
  }
  function cmdStats(T, args) {
    var p = parseAggs(args), aggs = p.aggs, by = p.by, rows = T.rows;
    var cols = by.concat(aggs.map(function (a) { return a.name; })), out = [];
    var groups = by.length ? groupBy(rows, by) : [{ key: [], rows: rows }];
    groups.forEach(function (g) {
      var o = {};
      by.forEach(function (b, j) { o[b] = g.key[j]; });
      aggs.forEach(function (a) { o[a.name] = aggregate(g.rows, a); });
      out.push(o);
    });
    if (by.length) out.sort(function (a, b) { for (var j = 0; j < by.length; j++) { var c = cmp(a[by[j]], b[by[j]]); if (c) return c; } return 0; });
    return { mode: 'table', cols: cols, rows: out };
  }
  function cmdEventstats(T, args) {
    var p = parseAggs(args), aggs = p.aggs, by = p.by;
    var groups = by.length ? groupBy(T.rows, by) : [{ key: [], rows: T.rows }], vals = new Map();
    groups.forEach(function (g) { var o = {}; aggs.forEach(function (a) { o[a.name] = aggregate(g.rows, a); }); g.rows.forEach(function (r) { vals.set(r, o); }); });
    var rows = T.rows.map(function (r) { var n = copyRow(r), o = vals.get(r); if (o) for (var k in o) n[k] = o[k]; return n; });
    var cols = T.cols ? T.cols.concat(aggs.map(function (a) { return a.name; }).filter(function (c) { return T.cols.indexOf(c) < 0; })) : null;
    return { mode: T.mode, cols: cols, rows: rows, extra: (T.extra || []).concat(aggs.map(function (a) { return a.name; })), sorted: T.sorted };
  }
  function spanMs(s) {
    var m = /^(\d+)(s|sec|m|min|h|hr|d|day|w|mon)?$/i.exec(String(s || '').trim());
    if (!m) throw new Error('span: use e.g. span=5m, span=1h, span=1d');
    var u = (m[2] || 's').toLowerCase(), n = Number(m[1]);
    return n * (u[0] === 's' ? 1000 : u[0] === 'm' && u !== 'mon' ? 60000 : u[0] === 'h' ? 3600000 : u[0] === 'd' ? 86400000 : u[0] === 'w' ? 604800000 : 2592000000);
  }
  function bucketT(o, w) { var t = o._t; if (t === undefined || isNaN(t)) { var tt = Date.parse(String(o._time) + (/Z$/.test(String(o._time)) ? '' : 'Z')); t = tt; } if (isNaN(t)) return null; return Math.floor(t / w) * w; }
  function cmdBin(T, args) {
    var t = toks(args), f = '_time', w = 0;
    t.forEach(function (k) { var m = /^span=(.+)$/i.exec(k); if (m) w = spanMs(m[1]); else if (k !== ',' && !/^as$/i.test(k)) f = unq(k); });
    if (f !== '_time') throw new Error('bin: this explorer bins _time only, e.g. bin _time span=5m');
    if (!w) throw new Error('bin _time needs span=, e.g. bin _time span=5m');
    var rows = T.rows.map(function (o) { var n = copyRow(o), b = bucketT(o, w); if (b !== null) { n._t = b; n._time = fmtT(b); } return n; });
    return { mode: T.mode, cols: T.cols, rows: rows, extra: T.extra, sorted: T.sorted };
  }
  function cmdTimechart(T, args) {
    var t = toks(args), w = 0, rest = [], limit = 10;
    t.forEach(function (k) { var m = /^span=(.+)$/i.exec(k), l = /^limit=(\d+)$/i.exec(k); if (m) w = spanMs(m[1]); else if (l) limit = Number(l[1]); else rest.push(k); });
    var p = parseAggs(rest.join(' ')), agg = p.aggs[0], by = p.by[0];
    if (p.aggs.length > 1) throw new Error('timechart: one function at a time, e.g. timechart span=5m count by host');
    var ts = T.rows.map(function (o) { return o._t; }).filter(function (x) { return !isNaN(x); });
    if (!ts.length) return { mode: 'table', cols: ['_time', agg.name], rows: [], chart: true };
    var lo = Math.min.apply(null, ts), hi = Math.max.apply(null, ts);
    if (!w) { var span = hi - lo; w = span > 7 * 86400000 ? 86400000 : span > 86400000 ? 3600000 : span > 4 * 3600000 ? 1800000 : span > 3600000 ? 300000 : 60000; }
    var start = Math.floor(lo / w) * w, n = Math.floor((hi - start) / w) + 1;
    if (n > 2000) throw new Error('timechart: span too small for this time range (' + n + ' buckets)');
    var series = [agg.name], seriesRows = {};
    if (by) {
      var g = groupBy(T.rows, [by]).map(function (x) { return { k: show(x.key[0]), rows: x.rows }; }).sort(function (a, b) { return b.rows.length - a.rows.length; });
      series = g.slice(0, limit).map(function (x) { return x.k; });
      var other = g.slice(limit); if (other.length) series.push('OTHER');
      g.forEach(function (x, i) { var k = i < limit ? x.k : 'OTHER'; seriesRows[k] = (seriesRows[k] || []).concat(x.rows); });
    } else seriesRows[agg.name] = T.rows;
    var out = [];
    for (var i = 0; i < n; i++) {
      var b = start + i * w, o = { _time: fmtT(b) };
      series.forEach(function (s) { var rs = (seriesRows[s] || []).filter(function (r) { return r._t >= b && r._t < b + w; }); var v = aggregate(rs, agg); o[s] = v === null ? 0 : v; });
      out.push(o);
    }
    return { mode: 'table', cols: ['_time'].concat(series), rows: out, chart: true };
  }
  function cmdTop(T, args, rare) {
    var t = toks(args), limit = 10, fs = [], by = [];
    for (var i = 0; i < t.length; i++) { var k = t[i]; var m = /^limit=(\d+)$/i.exec(k); if (m) limit = Number(m[1]); else if (/^by$/i.test(k)) { by = fieldList(t.slice(i + 1)); break; } else if (k !== ',' && !/^(countfield|showperc|showcount)=/i.test(k)) fs.push(unq(k)); }
    if (!fs.length) throw new Error((rare ? 'rare' : 'top') + ': name a field, e.g. ' + (rare ? 'rare' : 'top') + ' src_ip');
    var g = groupBy(T.rows, by.concat(fs)), total = T.rows.length, totals = {};
    if (by.length) groupBy(T.rows, by).forEach(function (x) { totals[JSON.stringify(x.key.map(show))] = x.rows.length; });
    var out = g.map(function (x) { var o = {}; by.concat(fs).forEach(function (f, j) { o[f] = x.key[j]; }); o.count = x.rows.length; var tt = by.length ? totals[JSON.stringify(x.key.slice(0, by.length).map(show))] : total; o.percent = round(100 * x.rows.length / (tt || 1)); return o; });
    out.sort(function (a, b) { for (var j = 0; j < by.length; j++) { var c = cmp(a[by[j]], b[by[j]]); if (c) return c; } return rare ? a.count - b.count : b.count - a.count; });
    if (by.length) { var cnt = {}; out = out.filter(function (o) { var k = JSON.stringify(by.map(function (b) { return show(o[b]); })); cnt[k] = (cnt[k] || 0) + 1; return cnt[k] <= limit; }); }
    else out = out.slice(0, limit || out.length);
    return { mode: 'table', cols: by.concat(fs, ['count', 'percent']), rows: out };
  }
  function allFields(rows) { var s = {}, out = []; rows.slice(0, 2000).forEach(function (o) { for (var k in o) if ((k[0] !== '_' || k === '_time' || k === '_raw') && !s[k]) { s[k] = 1; out.push(k); } }); return out; }
  function cmdTable(T, args, isFields) {
    var t = toks(args), minus = false;
    if (t[0] === '-') { minus = true; t = t.slice(1); } else if (t[0] === '+') t = t.slice(1);
    var fs = fieldList(t);
    if (!fs.length) throw new Error((isFields ? 'fields' : 'table') + ': name at least one field');
    var all = T.mode === 'table' ? (T.cols || []) : allFields(T.rows);
    var cols = [];
    fs.forEach(function (f) {
      if (f.indexOf('*') >= 0) { var w = wild(f); all.forEach(function (c) { if (w(c.toLowerCase()) && cols.indexOf(c) < 0) cols.push(c); }); }
      else if (cols.indexOf(f) < 0) cols.push(f);
    });
    if (minus) {
      var keep = all.filter(function (c) { return cols.indexOf(c) < 0; });
      if (T.mode === 'table') return { mode: 'table', cols: keep, rows: T.rows, sorted: T.sorted };
      var rows = T.rows.map(function (o) { var n = {}; for (var k in o) if (cols.indexOf(k) < 0) n[k] = o[k]; return n; });
      return { mode: 'events', rows: rows, extra: T.extra, sorted: T.sorted };
    }
    if (isFields && T.mode === 'events') {
      var rows2 = T.rows.map(function (o) { var n = {}; for (var k in o) if (k[0] === '_' || cols.indexOf(k) >= 0) n[k] = o[k]; return n; });
      return { mode: 'events', rows: rows2, extra: T.extra, sorted: T.sorted, only: cols };
    }
    return { mode: 'table', cols: cols, rows: T.rows, sorted: T.sorted };
  }
  function cmdSort(T, args) {
    var t = toks(args), keys = [], limit = 0, sign = 1;
    t.forEach(function (k) {
      if (k === ',') return;
      if (/^\d+$/.test(k) && !keys.length) { limit = Number(k); return; }
      if (k === '-') { sign = -1; return; }
      if (k === '+') { sign = 1; return; }
      var d = sign; if (k[0] === '-') { d = -1; k = k.slice(1); } else if (k[0] === '+') { d = 1; k = k.slice(1); }
      var m = /^(?:num|str|auto)\((.*)\)$/.exec(k); if (m) k = m[1];
      keys.push({ f: unq(k), d: d }); sign = 1;
    });
    var rows = T.rows.slice().sort(function (a, b) { for (var i = 0; i < keys.length; i++) { var c = cmp(a[keys[i].f], b[keys[i].f]); if (c) return c * keys[i].d; } return 0; });
    if (limit) rows = rows.slice(0, limit);
    return { mode: T.mode, cols: T.cols, rows: rows, sorted: true, extra: T.extra, only: T.only };
  }
  function cmdDedup(T, args) {
    var fs = fieldList(toks(args)), seen = {};
    var rows = T.rows.filter(function (o) { var k = JSON.stringify(fs.map(function (f) { return show(o[f]); })); if (seen[k]) return false; seen[k] = 1; return true; });
    return { mode: T.mode, cols: T.cols, rows: rows, sorted: T.sorted, extra: T.extra, only: T.only };
  }
  function cmdDelta(T, args) {
    var t = toks(args), f = unq(t[0] || ''), name = 'delta(' + f + ')';
    if (!f) throw new Error('delta: name a field, e.g. delta ts as gap');
    if (t[1] && t[1].toLowerCase() === 'as' && t[2]) name = unq(t[2]);
    var prev = null;
    var rows = T.rows.map(function (o) {
      var n = copyRow(o);
      var v = f === '_time' ? Math.floor(o._t / 1000) : Number(o[f]);
      n[name] = (prev === null || isNaN(v)) ? null : round(v - prev);
      if (!isNaN(v)) prev = v;
      return n;
    });
    var cols = T.cols ? T.cols.concat([name]) : null;
    return { mode: T.mode, cols: cols, rows: rows, extra: (T.extra || []).concat([name]), sorted: T.sorted, only: T.only };
  }
  function cmdRename(T, args) {
    var t = toks(args).filter(function (x) { return x !== ','; }), pairs = [];
    for (var i = 0; i + 2 < t.length; i += 3) { if (t[i + 1].toLowerCase() !== 'as') throw new Error('rename: use rename old as new'); pairs.push([unq(t[i]), unq(t[i + 2])]); }
    if (!pairs.length) throw new Error('rename: use rename old as new');
    function rn(k) { for (var j = 0; j < pairs.length; j++) if (pairs[j][0] === k) return pairs[j][1]; return k; }
    var rows = T.rows.map(function (o) { var n = {}; for (var k in o) n[rn(k)] = o[k]; return n; });
    return { mode: T.mode, cols: T.cols ? T.cols.map(rn) : null, rows: rows, sorted: T.sorted, extra: T.extra ? T.extra.map(rn) : T.extra, only: T.only ? T.only.map(rn) : T.only };
  }
  function cmdRex(T, args) {
    var m = /^(?:field=(\S+)\s+)?(?:max_match=\d+\s+)?"((?:[^"\\]|\\.)*)"\s*$/.exec(args.trim());
    if (!m) throw new Error('rex: use rex field=<field> "pattern with (?<name>...)"  — the default field is _raw');
    var f = m[1] ? unq(m[1]) : '_raw', pat = m[2].replace(/\\"/g, '"'), re;
    try { re = new RegExp(pat); } catch (e) { throw new Error('rex: the regex is not valid — ' + String(e.message || e).replace(/^.*: /, '')); }
    if (!/\(\?<[A-Za-z_]\w*>/.test(pat)) throw new Error('rex: name at least one group, e.g. (?<user>\\S+)');
    var names = [];
    pat.replace(/\(\?<([A-Za-z_]\w*)>/g, function (_, n) { if (names.indexOf(n) < 0) names.push(n); return _; });
    var rows = T.rows.map(function (o) {
      var src = o[f]; if (src === undefined || src === null) return o;
      var mm = re.exec(Array.isArray(src) ? src.join('\n') : String(src));
      if (!mm || !mm.groups) return o;
      var n = copyRow(o), any = false;
      for (var k in mm.groups) if (mm.groups[k] !== undefined) { n[k] = mm.groups[k]; any = true; }
      return any ? n : o;
    });
    var cols = T.cols ? T.cols.concat(names.filter(function (c) { return T.cols.indexOf(c) < 0; })) : null;
    return { mode: T.mode, cols: cols, rows: rows, extra: (T.extra || []).concat(names), sorted: T.sorted, only: T.only ? T.only.concat(names) : T.only };
  }
  function cmdEval(T, args) {
    /* eval a=expr, b=expr … (top-level commas split the assignments) */
    var parts = [], depth = 0, cur = '', inq = false;
    for (var i = 0; i < args.length; i++) {
      var c = args[i];
      if ((c === '"' || c === "'") && args[i - 1] !== '\\') { if (!inq) inq = c; else if (inq === c) inq = false; }
      if (!inq && c === '(') depth++;
      if (!inq && c === ')') depth--;
      if (c === ',' && !inq && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    var assigns = parts.map(function (p) {
      var m = /^\s*([A-Za-z_][\w.:]*)\s*=(?!=)([\s\S]+)$/.exec(p);
      if (!m) throw new Error('eval: use eval name=expression, e.g. eval kind=if(status>=400,"error","ok")');
      return { name: m[1], fn: compileExpr(m[2]) };
    });
    var rows = T.rows.map(function (o) {
      var n = copyRow(o);
      assigns.forEach(function (a) { var v = a.fn(n); if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) delete n[a.name]; else n[a.name] = typeof v === 'boolean' ? (v ? 'true' : 'false') : (typeof v === 'number' ? round(v) : v); if (a.name === '_time' && n._time !== undefined) { var tt = isNum(n._time) ? Number(n._time) * 1000 : Date.parse(String(n._time)); if (!isNaN(tt)) { n._t = tt; n._time = fmtT(tt); } } });
      return n;
    });
    var names = assigns.map(function (a) { return a.name; });
    var cols = T.cols ? T.cols.concat(names.filter(function (c) { return T.cols.indexOf(c) < 0; })) : null;
    return { mode: T.mode, cols: cols, rows: rows, extra: (T.extra || []).concat(names), sorted: T.sorted, only: T.only ? T.only.concat(names) : T.only };
  }
  function cmdWhere(T, args) {
    var f;
    try { f = compileExpr(args); } catch (e) { f = compileSearch(args); }
    var rows = T.rows.filter(function (o) { return truthy(f(o)); });
    return { mode: T.mode, cols: T.cols, rows: rows, extra: T.extra, sorted: T.sorted, only: T.only };
  }
  function cmdLookup(T, args) {
    var t = toks(args).filter(function (x) { return x !== ','; });
    var name = unq(t[0] || ''), L = (window.HUNT_LOOKUP || {})[name];
    if (!L) throw new Error('lookup: unknown table "' + name + '"' + (window.HUNT_LOOKUP ? ' — available: ' + Object.keys(window.HUNT_LOOKUP).join(', ') : ''));
    var i = 1, lk = unq(t[i++] || ''), rk = lk;
    if (!lk) throw new Error('lookup: use lookup <table> <lookup field> [AS <event field>] OUTPUT <fields>');
    if (t[i] && /^as$/i.test(t[i])) { rk = unq(t[i + 1]); i += 2; }
    var outs = [];
    if (t[i] && /^output(new)?$/i.test(t[i])) outs = t.slice(i + 1).map(unq);
    if (!outs.length) outs = L.f.filter(function (c) { return c !== lk; });
    var li = L.f.indexOf(lk); if (li < 0) throw new Error('lookup: "' + lk + '" is not a column of ' + name + ' (' + L.f.join(', ') + ')');
    var map = {}; L.r.forEach(function (r) { map[String(r[li]).toLowerCase()] = r; });
    var rows = T.rows.map(function (o) {
      var v = o[rk]; if (v === undefined || v === null) return o;
      var r = map[String(Array.isArray(v) ? v[0] : v).toLowerCase()]; if (!r) return o;
      var n = copyRow(o); outs.forEach(function (c) { var ci = L.f.indexOf(c); if (ci >= 0) n[c] = r[ci]; }); return n;
    });
    var cols = T.cols ? T.cols.concat(outs.filter(function (c) { return T.cols.indexOf(c) < 0; })) : null;
    return { mode: T.mode, cols: cols, rows: rows, extra: (T.extra || []).concat(outs), sorted: T.sorted, only: T.only ? T.only.concat(outs) : T.only };
  }
  function cmdFillnull(T, args) {
    var t = toks(args), val = '0', fs = [];
    t.forEach(function (k) { var m = /^value=(.+)$/.exec(k); if (m) val = unq(m[1]); else if (k !== ',') fs.push(unq(k)); });
    var all = fs.length ? fs : (T.cols || allFields(T.rows));
    var rows = T.rows.map(function (o) { var n = copyRow(o); all.forEach(function (f) { if (n[f] === undefined || n[f] === null || n[f] === '') n[f] = val; }); return n; });
    return { mode: T.mode, cols: T.cols, rows: rows, extra: T.extra, sorted: T.sorted, only: T.only };
  }
  var KNOWN = 'stats, eventstats, chart, timechart, bin, top, rare, table, fields, sort, reverse, head, tail, dedup, where, search, eval, rex, lookup, fillnull, delta, rename';
  function run(data, q) {
    var parts = splitPipes(q || ''), base = parts[0].replace(/^search\s+/i, '');
    if (/\[\s*search\b/i.test(base)) throw new Error('This explorer does not run subsearches [ ]. Use stats, or run the search in Splunk.');
    var filt = compileSearch(base);
    var hits = data.rows.filter(filt);
    var T = { mode: 'events', rows: hits };
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i]; if (!p) continue;
      var m = /^(\w+)\s*([\s\S]*)$/.exec(p); if (!m) throw new Error('I do not understand "' + p + '"');
      var c = m[1].toLowerCase(), a = m[2];
      if (c === 'stats') T = cmdStats(T, a);
      else if (c === 'chart') T = cmdStats(T, a.replace(/\s+over\s+/i, ' by '));
      else if (c === 'eventstats') T = cmdEventstats(T, a);
      else if (c === 'timechart') T = cmdTimechart(T, a);
      else if (c === 'bin' || c === 'bucket') T = cmdBin(T, a);
      else if (c === 'top') T = cmdTop(T, a, false);
      else if (c === 'rare') T = cmdTop(T, a, true);
      else if (c === 'table') T = cmdTable(T, a, false);
      else if (c === 'fields') T = cmdTable(T, a, true);
      else if (c === 'sort') T = cmdSort(T, a);
      else if (c === 'reverse') T = { mode: T.mode, cols: T.cols, rows: T.rows.slice().reverse(), extra: T.extra, sorted: true, only: T.only };
      else if (c === 'head' || c === 'tail') { var n = Number((a.match(/\d+/) || [10])[0]); T = { mode: T.mode, cols: T.cols, rows: c === 'head' ? T.rows.slice(0, n) : T.rows.slice(-n), extra: T.extra, sorted: T.sorted, only: T.only }; }
      else if (c === 'dedup') T = cmdDedup(T, a);
      else if (c === 'search') { var f2 = compileSearch(a); T = { mode: T.mode, cols: T.cols, rows: T.rows.filter(f2), extra: T.extra, sorted: T.sorted, only: T.only }; }
      else if (c === 'where') T = cmdWhere(T, a);
      else if (c === 'eval') T = cmdEval(T, a);
      else if (c === 'rex') T = cmdRex(T, a);
      else if (c === 'lookup') T = cmdLookup(T, a);
      else if (c === 'fillnull') T = cmdFillnull(T, a);
      else if (c === 'delta') T = cmdDelta(T, a);
      else if (c === 'rename') T = cmdRename(T, a);
      else if (c === 'join' || c === 'transaction' || c === 'iplocation' || c === 'append' || c === 'inputlookup') throw new Error('This explorer does not run "' + c + '". It works in Splunk — here, use stats or lookup.');
      else throw new Error('This explorer does not know "' + c + '". Use: ' + KNOWN + '.');
    }
    return { hits: hits, T: T };
  }

  /* ---------------- UI ---------------- */
  function hhmmss(o) { var t = o._time || o.timestamp || ''; return String(t).replace('T', ' ').replace(/Z$/, ''); }
  function build(root) {
    var id = root.getAttribute('data-game'), idx = root.getAttribute('data-index');
    var keyf = (root.getAttribute('data-key') || '').split(',').filter(Boolean);
    root.innerHTML =
      '<div class="hx-bar">' + (idx ? '<span class="hx-idx">index=' + esc(idx) + '</span>' : '') +
      '<textarea class="hx-q" rows="1" spellcheck="false" aria-label="Search" placeholder="' + esc(root.getAttribute('data-placeholder') || 'e.g. log_type=web_proxy | top dest_host') + '"></textarea>' +
      '<button class="hx-run" type="button">Search</button></div>' +
      '<div class="hx-tools"><span class="hx-ex"></span><span class="hx-act"><button type="button" class="hx-copy">Copy for Splunk</button><button type="button" class="hx-clear">Clear</button></span></div>' +
      '<div class="hx-status" aria-live="polite">Loading the logs…</div>' +
      '<div class="hx-hist" aria-hidden="true"></div>' +
      '<div class="hx-main"><aside class="hx-side"><div class="hx-side-h">Fields <small>click to see top values</small></div><div class="hx-fields"></div></aside>' +
      '<div class="hx-res"><div class="hx-out"></div><div class="hx-pager"></div></div></div>';
    var qi = $('.hx-q', root), out = $('.hx-out', root), status = $('.hx-status', root), side = $('.hx-fields', root),
      hist = $('.hx-hist', root), pager = $('.hx-pager', root), ex = $('.hx-ex', root);
    var data = null, res = null, page = 0, newest = root.hasAttribute('data-newest');
    (root.getAttribute('data-examples') || '').split('||').filter(Boolean).forEach(function (e) {
      var b = el('button', 'hx-chip', esc(e)); b.type = 'button';
      b.addEventListener('click', function () { qi.value = e; go(); });
      ex.appendChild(b);
    });
    function grow() { qi.style.height = 'auto'; qi.style.height = Math.min(qi.scrollHeight, 140) + 'px'; }
    qi.addEventListener('input', grow);
    qi.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    $('.hx-run', root).addEventListener('click', go);
    $('.hx-clear', root).addEventListener('click', function () { qi.value = ''; go(); });
    $('.hx-copy', root).addEventListener('click', function () {
      var q = qi.value.trim(), s = (!idx || /^\s*index\s*=/.test(q) || /^\s*\(/.test(q)) ? q : 'index=' + idx + ' ' + q;
      var b = this;
      function ok() { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = 'Copy for Splunk'; }, 1400); }
      try { navigator.clipboard.writeText(s.trim()).then(ok, function () { prompt('Copy this search:', s.trim()); }); } catch (e) { qi.value = s.trim(); qi.select(); }
    });
    function addTerm(f, v) {
      var parts = splitPipes(qi.value), term = f + '=' + (/[\s"|=]/.test(String(v)) || String(v) === '' ? '"' + String(v).replace(/"/g, '\\"') + '"' : String(v));
      parts[0] = (parts[0] ? parts[0] + ' ' : '') + term;
      qi.value = parts.join(' | '); go();
    }
    function go() {
      if (!data) return;
      grow();
      var t0 = performance.now();
      try { res = run(data, qi.value.trim()); }
      catch (e) { status.innerHTML = '<span class="hx-err">⚠ ' + esc(e.message) + '</span>'; return; }
      page = 0;
      var ms = Math.round(performance.now() - t0);
      status.innerHTML = '<b>' + res.hits.length.toLocaleString('en-US') + '</b> of ' + data.rows.length.toLocaleString('en-US') + ' events' +
        (res.T.mode === 'table' ? ' → <b>' + res.T.rows.length.toLocaleString('en-US') + '</b> result rows' : '') + ' <span class="hx-ms">(' + ms + ' ms)</span>' +
        (res.T.mode === 'events' && !res.T.sorted ? ' <button type="button" class="hx-order">' + (newest ? 'Newest first ↓' : 'Oldest first ↑') + '</button>' : '');
      var ob = $('.hx-order', status);
      if (ob) ob.addEventListener('click', function () { newest = !newest; go(); });
      drawHist(); drawFields(); draw();
    }
    function drawHist() {
      var src = res.hits.length > 1 ? res.hits : data.rows;
      var a = Infinity, b = -Infinity;
      src.forEach(function (o) { if (o._t < a) a = o._t; if (o._t > b) b = o._t; });
      if (!isFinite(a)) { hist.innerHTML = ''; return; }
      if (b === a) b = a + 60000;
      var n = 60, bins = new Array(n).fill(0), w = (b - a) / n || 1;
      res.hits.forEach(function (o) { var i = Math.min(n - 1, Math.max(0, Math.floor((o._t - a) / w))); bins[i]++; });
      var mx = Math.max.apply(null, bins) || 1, h = '';
      bins.forEach(function (c, i) {
        var from = new Date(a + i * w).toISOString().slice(11, 19), to = new Date(a + (i + 1) * w).toISOString().slice(11, 19);
        h += '<span class="hx-b" style="height:' + (c ? Math.max(6, Math.round(100 * c / mx)) : 0) + '%" title="' + from + '–' + to + ' UTC: ' + c + ' events"></span>';
      });
      var multiDay = new Date(a).toISOString().slice(0, 10) !== new Date(b).toISOString().slice(0, 10);
      hist.innerHTML = '<div class="hx-bars">' + h + '</div><div class="hx-axis"><span>' + new Date(a).toISOString().slice(0, 16).replace('T', ' ') + ' UTC</span><span>' + new Date(b).toISOString().slice(multiDay ? 0 : 11, 16).replace('T', ' ') + '</span></div>';
    }
    function drawFields() {
      var rows = res.T.mode === 'events' ? res.T.rows : res.hits, cnt = {}, seen = {}, order = [];
      for (var i = 0; i < rows.length; i++) {
        var o = rows[i];
        for (var k in o) {
          if (k[0] === '_' || k === 'timestamp') continue;
          if (!cnt[k]) { cnt[k] = 0; seen[k] = {}; order.push(k); }
          cnt[k]++;
          if (seen[k] !== null) { seen[k][show(o[k])] = 1; if (Object.keys(seen[k]).length > 500) seen[k] = null; }
        }
      }
      order.sort(function (a, b) { var ka = keyf.indexOf(a), kb = keyf.indexOf(b); if (ka >= 0 || kb >= 0) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb); return 0; });
      side.innerHTML = order.length ? '' : '<p class="hx-none">No events.</p>';
      order.forEach(function (k) {
        var d = el('details', 'hx-f'), dc = seen[k] === null ? '500+' : Object.keys(seen[k]).length;
        d.innerHTML = '<summary><span class="hx-fn">' + esc(k) + '</span><span class="hx-fc">' + dc + '</span></summary>';
        d.addEventListener('toggle', function () {
          if (!d.open || d.querySelector('ol')) return;
          var c = {}, tot = 0;
          rows.forEach(function (o) { var v = o[k]; if (v === undefined || v === null) return; (Array.isArray(v) ? v : [v]).forEach(function (x) { c[show(x)] = (c[show(x)] || 0) + 1; tot++; }); });
          var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 10);
          var ol = el('ol', 'hx-top');
          top.forEach(function (v) {
            var li = el('li', '', '<button type="button" title="Add ' + esc(k) + '=' + esc(v) + ' to the search"><span class="hx-tv">' + esc(v === '' ? '(empty)' : v) + '</span><span class="hx-tn">' + c[v] + '</span><i style="width:' + Math.round(100 * c[v] / (tot || 1)) + '%"></i></button>');
            li.firstChild.addEventListener('click', function () { addTerm(k, v); });
            ol.appendChild(li);
          });
          d.appendChild(ol);
          var q = el('button', 'hx-qs', 'stats count by ' + esc(k)); q.type = 'button';
          q.addEventListener('click', function () { var p = splitPipes(qi.value)[0]; qi.value = (p ? p + ' ' : '') + '| stats count by ' + k + ' | sort -count'; go(); });
          d.appendChild(q);
        });
        side.appendChild(d);
      });
    }
    function chartHtml(T) {
      var series = T.cols.slice(1), mx = 0;
      T.rows.forEach(function (o) { var s = 0; series.forEach(function (c) { s += Number(o[c]) || 0; }); if (s > mx) mx = s; });
      if (!mx) return '';
      var COL = ['var(--cyan)', 'var(--amber)', 'var(--green)', 'var(--red)', 'var(--purple)', '#8ea3c2', '#f0a35e', '#5ad1ff', '#c9a6ff', '#9bd37a', '#ff8fa3'];
      var bars = T.rows.map(function (o) {
        var tip = hhmmss(o) + ': ' + series.map(function (c) { return c + ' ' + show(o[c]); }).join(', ');
        var segs = series.map(function (c, i) { var v = Number(o[c]) || 0; return v ? '<i style="height:' + Math.round(100 * v / mx) + '%;background:' + COL[i % COL.length] + '"></i>' : ''; }).join('');
        return '<span class="hx-tb" title="' + esc(tip) + '">' + segs + '</span>';
      }).join('');
      var leg = series.length > 1 ? '<div class="hx-leg">' + series.map(function (c, i) { return '<span><i style="background:' + COL[i % COL.length] + '"></i>' + esc(c) + '</span>'; }).join('') + '</div>' : '';
      return '<div class="hx-chart"><div class="hx-tbars">' + bars + '</div><div class="hx-axis"><span>' + esc(hhmmss(T.rows[0])) + '</span><span>max ' + mx + '</span><span>' + esc(hhmmss(T.rows[T.rows.length - 1])) + '</span></div>' + leg + '</div>';
    }
    function draw() {
      var T = res.T, rows = T.rows, pages = Math.max(1, Math.ceil(rows.length / PAGE));
      if (page >= pages) page = pages - 1;
      var view = rows;
      if (T.mode === 'events' && !T.sorted && newest) view = rows.slice().reverse();
      view = view.slice(page * PAGE, page * PAGE + PAGE);
      if (!rows.length) out.innerHTML = '<p class="hx-none">No results. Check the field name and the value (the field list on the left shows what exists).</p>';
      else if (T.mode === 'table') {
        var h = (T.chart ? chartHtml(T) : '') + '<div class="hx-tw"><table class="hx-t"><thead><tr>' + T.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        view.forEach(function (o) { h += '<tr>' + T.cols.map(function (c) { var v = c === '_time' ? hhmmss(o) : show(o[c]); return '<td' + (isNum(o[c]) && c !== '_time' ? ' class="n"' : '') + '>' + esc(v).replace(/\n/g, '<br>') + '</td>'; }).join('') + '</tr>'; });
        out.innerHTML = h + '</tbody></table></div>';
      } else {
        var e = '';
        view.forEach(function (o) {
          var kv = '';
          for (var k in o) {
            if ((k[0] === '_' && k !== '_raw') || k === 'timestamp') continue;
            if (T.only && T.only.indexOf(k) < 0 && k !== '_raw') continue;
            var v = o[k]; if (v === null || v === undefined) continue;
            if (k === '_raw') continue;
            kv += '<span class="hx-kv" data-k="' + esc(k) + '" data-v="' + esc(show(v)) + '"><b>' + esc(k) + '</b>=' + esc(show(v)) + '</span> ';
          }
          var raw = o._raw !== undefined ? '<span class="hx-raw">' + esc(show(o._raw)) + '</span>' : '';
          e += '<div class="hx-ev' + (raw ? ' has-raw' : '') + '"><span class="hx-ts">' + esc(hhmmss(o)) + '</span><span class="hx-body">' + raw + (raw && kv ? '<span class="hx-kvs">' + kv + '</span>' : kv) + '</span></div>';
        });
        out.innerHTML = e;
      }
      pager.innerHTML = rows.length > PAGE ? '<button type="button" class="hx-pv"' + (page ? '' : ' disabled') + '>‹ Prev</button><span>Page ' + (page + 1) + ' of ' + pages + '</span><button type="button" class="hx-nx"' + (page < pages - 1 ? '' : ' disabled') + '>Next ›</button>' : '';
      var pv = $('.hx-pv', pager), nx = $('.hx-nx', pager);
      if (pv) pv.addEventListener('click', function () { page--; draw(); root.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      if (nx) nx.addEventListener('click', function () { page++; draw(); root.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    }
    out.addEventListener('click', function (e) {
      var s = e.target.closest('.hx-kv'); if (!s) return;
      addTerm(s.getAttribute('data-k'), s.getAttribute('data-v'));
    });
    root._hx = { query: function (q) { qi.value = q; go(); return res; }, ready: false };
    load(id, function (err, d) {
      if (err) { status.innerHTML = '<span class="hx-err">⚠ ' + esc(err) + '</span>'; return; }
      data = d; root._hx.ready = true; root.setAttribute('data-ready', '1');
      var q0 = root.getAttribute('data-query'); if (q0) qi.value = q0;
      go();
    }, root.getAttribute('data-src'));
  }

  /* ---------------- game switching ---------------- */
  function pick(id) {
    var games = $$('.hunt-game');
    if (!games.length) return;
    if (!id || !$('#' + id)) id = games[0].id;
    games.forEach(function (g) { g.hidden = g.id !== id; });
    $$('.hunt-pick a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + id); a.setAttribute('aria-current', a.getAttribute('href') === '#' + id ? 'true' : 'false'); });
    var x = $('#' + id + ' .hx');
    if (x && !x._built) { x._built = true; build(x); }
  }
  document.addEventListener('DOMContentLoaded', function () {
    $$('.hunt-pick a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); var id = a.getAttribute('href').slice(1);
        try { history.replaceState(null, '', '#' + id); } catch (err) { location.hash = id; }
        pick(id);
        var g = $('#' + id); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    pick((location.hash || '').slice(1));
    window.addEventListener('hashchange', function () { pick((location.hash || '').slice(1)); });
    /* explorers outside the hunts page (Session 4): build them all now */
    $$('.hx').forEach(function (x) { if (!x.closest('.hunt-game') && !x._built) { x._built = true; build(x); } });
  });
  window.HuntExplorer = { run: run, load: load, compileExpr: compileExpr };
})();
