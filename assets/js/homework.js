/* ==========================================================================
   ITGate eCIR — Homework task system
   Mark done (saved locally) · add to calendar (.ics) · copy task
   ========================================================================== */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', wire);
  /* re-wire when the instructor adds or removes a custom task */
  document.addEventListener('itg:tasks-changed', function () { setTimeout(wire, 0); });

  function wire() {
    var tasks = Array.prototype.slice.call(document.querySelectorAll('.task'));
    if (!tasks.length) return;

    var sessionId = document.body.getAttribute('data-session') || 'sX';

    tasks.forEach(function (task, i) {
      if (task.getAttribute('data-wired')) return;
      task.setAttribute('data-wired', '1');
      var id = sessionId + '-task-' + (i + 1);
      var key = 'itg-' + id;

      /* restore saved state */
      try { if (localStorage.getItem(key) === '1') task.classList.add('done'); } catch (e) {}

      var btns = task.querySelector('.task-btns');
      if (!btns) return;

      /* --- mark done --- */
      var done = document.createElement('button');
      done.className = 'btn-sm done-btn';
      setDoneLabel();
      done.addEventListener('click', function () {
        task.classList.toggle('done');
        try { localStorage.setItem(key, task.classList.contains('done') ? '1' : '0'); } catch (e) {}
        setDoneLabel();
        updateProgress();
      });
      btns.appendChild(done);
      function setDoneLabel() {
        var isDone = task.classList.contains('done');
        done.textContent = isDone ? '✓ Completed' : '☐ Mark as done';
        done.classList.toggle('is-done', isDone);
      }

      /* --- add to calendar --- */
      var due = task.getAttribute('data-due');
      if (due) {
        var cal = document.createElement('button');
        cal.className = 'btn-sm';
        cal.textContent = '📅 Add to calendar';
        cal.addEventListener('click', function () { downloadIcs(task, due, sessionId); });
        btns.appendChild(cal);
      }

      /* --- copy task --- */
      var copy = document.createElement('button');
      copy.className = 'btn-sm';
      copy.textContent = '⧉ Copy';
      copy.addEventListener('click', function () {
        var title = task.querySelector('.task-title').textContent.trim();
        var body = (task.querySelector('.task-body') || {}).textContent || '';
        var links = Array.prototype.slice.call(task.querySelectorAll('.task-link'))
          .map(function (a) { return a.href; }).join('\n');
        var txt = title + '\n' + body.trim() + (links ? '\n' + links : '') +
                  (due ? '\nDue: ' + due : '');
        navigator.clipboard.writeText(txt).then(function () {
          copy.textContent = '✓ Copied';
          setTimeout(function () { copy.textContent = '⧉ Copy'; }, 1600);
        });
      });
      btns.appendChild(copy);

      /* --- overdue badge --- */
      if (due) {
        var dueBadge = task.querySelector('.badge.due');
        if (dueBadge && new Date(due) < new Date(new Date().toDateString())) {
          dueBadge.classList.add('overdue');
          dueBadge.textContent = 'Overdue · ' + dueBadge.textContent.replace(/^Due · /, '');
        }
      }
    });

    /* --- header: progress + add all --- */
    updateProgress();
    var allBtn = document.getElementById('hwAddAll');
    if (allBtn && !allBtn.getAttribute('data-wired')) { allBtn.setAttribute('data-wired','1');
    allBtn.addEventListener('click', function () {
      downloadIcsAll(Array.prototype.slice.call(document.querySelectorAll('.task')), sessionId);
    }); }
    var resetBtn = document.getElementById('hwReset');
    if (resetBtn && !resetBtn.getAttribute('data-wired')) { resetBtn.setAttribute('data-wired','1');
    resetBtn.addEventListener('click', function () {
      tasks.forEach(function (t, i) {
        t.classList.remove('done');
        try { localStorage.removeItem('itg-' + sessionId + '-task-' + (i + 1)); } catch (e) {}
        var b = t.querySelector('.done-btn');
        if (b) { b.textContent = '☐ Mark as done'; b.classList.remove('is-done'); }
      });
      updateProgress();
    }); }

    function updateProgress() {
      var el = document.getElementById('hwProgress');
      if (!el) return;
      var req = tasks.filter(function (t) { return t.classList.contains('mandatory'); });
      var reqDone = req.filter(function (t) { return t.classList.contains('done'); });
      var allDone = tasks.filter(function (t) { return t.classList.contains('done'); });
      el.innerHTML = 'Required: <b>' + reqDone.length + ' / ' + req.length + '</b>' +
                     ' &nbsp;·&nbsp; All tasks: <b>' + allDone.length + ' / ' + tasks.length + '</b>';
    }
  }

  /* ---------- calendar helpers ---------- */
  function icsDate(d) { return d.replace(/-/g, ''); }
  function esc(s) { return String(s).replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n'); }

  function buildEvent(task, due, sessionId, n) {
    var title = task.querySelector('.task-title').textContent.trim();
    var type = task.classList.contains('mandatory') ? 'Required' : 'Optional';
    var body = ((task.querySelector('.task-body') || {}).textContent || '').trim();
    var links = Array.prototype.slice.call(task.querySelectorAll('.task-link'))
      .map(function (a) { return a.href; }).join(' | ');
    var end = new Date(due); end.setDate(end.getDate() + 1);
    var endStr = end.toISOString().slice(0, 10);

    return [
      'BEGIN:VEVENT',
      'UID:itgate-' + sessionId + '-' + n + '-' + Date.now() + '@itgate.academy',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
      'DTSTART;VALUE=DATE:' + icsDate(due),
      'DTEND;VALUE=DATE:' + icsDate(endStr),
      'SUMMARY:' + esc('[eCIR ' + type + '] ' + title),
      'DESCRIPTION:' + esc(body + (links ? '\n\n' + links : '')),
      'CATEGORIES:eCIR,' + type,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc('Due tomorrow: ' + title),
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');
  }

  function wrap(events) {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ITGate Academy//eCIR//EN', 'CALSCALE:GREGORIAN']
      .concat(events).concat(['END:VCALENDAR']).join('\r\n');
  }

  function save(content, name) {
    var blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function downloadIcs(task, due, sessionId) {
    save(wrap([buildEvent(task, due, sessionId, 1)]), 'ecir-task.ics');
  }

  function downloadIcsAll(tasks, sessionId) {
    var evts = [];
    tasks.forEach(function (t, i) {
      var due = t.getAttribute('data-due');
      if (due) evts.push(buildEvent(t, due, sessionId, i + 1));
    });
    if (!evts.length) return;
    save(wrap(evts), 'ecir-' + sessionId + '-homework.ics');
  }

})();
