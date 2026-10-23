// Terra Calendar home page: the hero week shows the real current week, and
// clicking a day cycles it through the app's day styles.
(function () {
  var STYLES = ['none', 'aurora', 'sunset', 'ocean', 'candy', 'mint', 'magma', 'rainbow', 'holo-prism'];
  var days = document.querySelectorAll('.week .day');
  if (!days.length) return;

  // Number the tiles for this week (Monday first) and mark today.
  var now = new Date();
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  var todayIndex = (now.getDay() + 6) % 7;
  days.forEach(function (day, i) {
    var d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    var num = day.querySelector('.day-num');
    if (num) num.textContent = d.getDate();
    day.classList.toggle('today', i === todayIndex);
    day.setAttribute('aria-label', d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + label(day) + '. Click to change the style.');
  });

  function label(day) {
    var s = day.getAttribute('data-style') || 'none';
    return s === 'none' ? 'plain' : s.replace('-', ' ') + ' style';
  }

  var hint = document.getElementById('hint');
  days.forEach(function (day) {
    day.addEventListener('click', function () {
      var current = STYLES.indexOf(day.getAttribute('data-style') || 'none');
      var next = STYLES[(current + 1) % STYLES.length];
      day.setAttribute('data-style', next);
      day.setAttribute('aria-label', day.getAttribute('aria-label').replace(/: [^.]+\./, ': ' + label(day) + '.'));
      if (hint && !hint.dataset.done) {
        hint.dataset.done = '1';
        hint.textContent = 'That one is called ' + label(day).replace(' style', '') + '. The app has over 60 more.';
      } else if (hint) {
        hint.textContent = next === 'none' ? 'Back to plain. Keep clicking for more.' : 'That one is called ' + label(day).replace(' style', '') + '.';
      }
    });
  });
})();
