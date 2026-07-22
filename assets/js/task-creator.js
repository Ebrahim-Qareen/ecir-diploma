/* ==========================================================================
   ITGate eCIR — Create your own homework task
   Adds a task to the list, saves it in the browser, and can export the HTML
   so the instructor can bake it permanently into the session file.
   ========================================================================== */
(function () {
  'use strict';

  var KEY, list, modal, form = {};

  document.addEventListener('DOMContentLoaded', function () {
    list  = document.getElementById('taskList');
    modal = document.getElementById('taskModal');
    if (!list || !modal) return;

    KEY = 'itg-' + (document.body.getAttribute('data-session') || 'sX') + '-custom-tasks';

    form.title = modal.querySelector('#tTitle');
    form.desc  = modal.querySelector('#tDesc');
    form.due   = modal.querySelector('#tDue');
    form.deliv = modal.querySelector('#tDeliver');
    form.links = modal.querySelector('#tLinks');

    /* required / optional toggle */
    var type = 'mandatory';
    modal.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        modal.querySelectorAll('.seg button').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        type = b.getAttribute('data-type');
      });
    });

    /* extra link rows */
    modal.querySelector('#addLink').addEventListener('click', function () {
      var row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = '<input type="text" placeholder="Label (e.g. THM room)" class="lk-label">' +
                      '<input type="text" placeholder="https://… or file.pdf" class="lk-url">';
      form.links.appendChild(row);
    });

    /* open / close */
    document.getElementById('btnNewTask').addEventListener('click', function () {
      modal.classList.add('open');
      form.title.focus();
    });
    modal.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', close);
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });

    /* save */
    modal.querySelector('#tSave').addEventListener('click', function () {
      var title = form.title.value.trim();
      if (!title) { form.title.focus(); form.title.style.borderColor = '#e0556b'; return; }

      var links = [];
      modal.querySelectorAll('.link-row').forEach(function (r) {
        var l = r.querySelector('.lk-label').value.trim();
        var u = r.querySelector('.lk-url').value.trim();
        if (u) links.push({ label: l || u, url: u });
      });

      var task = {
        id: 'c' + Date.now(),
        title: title,
        desc: form.desc.value.trim(),
        due: form.due.value,
        type: type,
        deliver: form.deliv.value.trim(),
        links: links
      };

      render(task);
      store(task);
      reset();
      close();
    });

    /* restore saved custom tasks */
    load().forEach(render);
  });

  function close() { modal.classList.remove('open'); }

  function reset() {
    form.title.value = ''; form.title.style.borderColor = '';
    form.desc.value = ''; form.due.value = ''; form.deliv.value = '';
    form.links.innerHTML =
      '<div class="link-row">' +
      '<input type="text" placeholder="Label (e.g. THM room)" class="lk-label">' +
      '<input type="text" placeholder="https://… or file.pdf" class="lk-url">' +
      '</div>';
  }

  /* ---------- storage ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function store(t) { var a = load(); a.push(t); try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function remove(id) {
    try { localStorage.setItem(KEY, JSON.stringify(load().filter(function (t) { return t.id !== id; }))); } catch (e) {}
  }

  /* ---------- render ---------- */
  function fmt(d) {
    if (!d) return '';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var p = d.split('-');
    return parseInt(p[2], 10) + ' ' + m[parseInt(p[1], 10) - 1];
  }

  function render(t) {
    var el = document.createElement('div');
    el.className = 'task custom ' + t.type;
    if (t.due) el.setAttribute('data-due', t.due);

    var badges = '<span class="badge ' + (t.type === 'mandatory' ? 'req">Required' : 'opt">Optional') + '</span>';
    if (t.due) badges += '<span class="badge due">Due · ' + fmt(t.due) + '</span>';

    var links = '';
    if (t.links && t.links.length) {
      links = '<div class="task-links">' + t.links.map(function (l) {
        return '<a class="task-link" href="' + l.url + '" target="_blank" rel="noopener">🔗 ' + esc(l.label) + '</a>';
      }).join('') + '</div>';
    }

    el.innerHTML =
      '<button class="task-del" title="Remove this task">✕</button>' +
      '<div class="task-top"><h3 class="task-title">' + esc(t.title) + '</h3>' + badges + '</div>' +
      (t.desc ? '<div class="task-body"><p>' + esc(t.desc) + '</p></div>' : '') +
      links +
      (t.deliver ? '<div class="task-deliver"><b>Deliverable:</b> ' + esc(t.deliver) + '</div>' : '') +
      '<div class="task-btns"></div>';

    el.querySelector('.task-del').addEventListener('click', function () {
      remove(t.id);
      el.remove();
      document.dispatchEvent(new Event('itg:tasks-changed'));
    });

    list.appendChild(el);
    document.dispatchEvent(new Event('itg:tasks-changed'));
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
})();
