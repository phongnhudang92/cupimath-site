// Trang huỷ nhận email: chỉ huỷ khi bố mẹ bấm nút, để trình quét link của Gmail / Outlook không tự huỷ thay.
(function () {
  var btn = document.getElementById('unsub-btn');
  var msg = document.getElementById('unsub-msg');
  var q = new URLSearchParams(location.search);
  var email = q.get('unsub');
  var token = q.get('t');
  var say = function (text) { msg.textContent = text; };
  if (!email || !token) { say('Liên kết huỷ nhận không đầy đủ. Bố mẹ mở lại link trong email nhé.'); btn.hidden = true; return; }

  btn.addEventListener('click', function () {
    var cfg = window.CUPI_SITE;
    if (!cfg || !cfg.url) { say('Có lỗi, bố mẹ thử lại sau nhé.'); return; }
    btn.disabled = true;
    var url = cfg.url + '/functions/v1/reminder-send?unsub=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(token);
    fetch(url, { method: 'POST' })
      .then(function (r) {
        if (r.ok) { say('Đã huỷ nhận. Cú Pi sẽ không gửi email nhắc nhở nữa ạ.'); btn.hidden = true; return; }
        say(r.status === 400 ? 'Liên kết không hợp lệ. Bố mẹ mở lại link trong email mới nhất nhé.' : 'Có lỗi, bố mẹ thử lại sau nhé.');
        btn.disabled = false;
      })
      .catch(function () { say('Không kết nối được, bố mẹ kiểm tra mạng rồi bấm lại nhé.'); btn.disabled = false; });
  });
})();
