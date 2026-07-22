/* ==========================================================================
   ITGate eCIR — Multiple choice questions
   <div class="q mcq" data-answer="b" data-why="explanation">
   ========================================================================== */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.q.mcq').forEach(function (q) {
      var answer = (q.getAttribute('data-answer') || '').toLowerCase();
      var why = q.getAttribute('data-why') || '';
      var opts = Array.prototype.slice.call(q.querySelectorAll('.opts li'));
      var fb = q.querySelector('.mcq-fb') || (function () {
        var d = document.createElement('div'); d.className = 'mcq-fb'; q.appendChild(d); return d;
      })();

      opts.forEach(function (li) {
        li.addEventListener('click', function () {
          if (q.classList.contains('answered')) return;
          q.classList.add('answered');

          var chosen = (li.getAttribute('data-opt') || '').toLowerCase();
          var right = chosen === answer;

          opts.forEach(function (o) {
            var k = (o.getAttribute('data-opt') || '').toLowerCase();
            if (k === answer) o.classList.add('correct');
            else if (o === li) o.classList.add('wrong');
            else o.classList.add('muted-opt');
          });

          fb.className = 'mcq-fb show ' + (right ? 'ok' : 'no');
          fb.innerHTML = (right ? '<b>Correct.</b> ' : '<b>Not quite.</b> ') + why;
        });
      });
    });
  });
})();
