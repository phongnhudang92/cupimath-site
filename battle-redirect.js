/* Web app là trang tĩnh: mở thẳng /app/battle/<mã> (tải lại trang phòng) → về sảnh kèm ?code=. File riêng vì CSP chặn script inline. */
(function () {
  var m = location.pathname.match(/^\/app\/battle\/([A-Za-z0-9]{6})\/?$/);
  if (m) location.replace('/app/battle?code=' + m[1].toUpperCase());
})();
