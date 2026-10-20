// Ô tra cứu điểm thi ở /tra-cuu-diem-thi/: gửi số điện thoại hoặc họ tên + ngày sinh tới dịch vụ
// "cupi-score-lookup" trên Cloud Run (workers/score-lookup), vẽ kết quả kèm lời chúc mừng và lời mời học trên web app.
// Dữ liệu trả về chỉ gắn bằng textContent, không dùng innerHTML.
(function () {
  var form = document.getElementById('lookup-form');
  var out = document.getElementById('lookup-result');
  if (!form || !out) return;
  var btn = form.querySelector('.lookup-submit');
  var GREAT_SCORE = 80;   // mốc huy chương Vàng theo thang quốc tế
  var NOT_PASSED = /không|chưa|trượt/i;   // mục Giải ghi "Không đạt"… thì động viên, không chúc mừng
  var SCROLL = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  var COOLDOWN_MS = 3000;   // chặn bấm liên tục: chờ giữa hai lần tra
  var REUSE_MS = 120000;    // tra lại đúng thông tin trong 2 phút thì dùng lại kết quả (bằng bộ đệm của server)
  // Chờ lâu thì báo dần cho phụ huynh: trang gốc ngày công bố điểm có lúc vài phút mới trả lời.
  var WAIT_NOTES = [
    [5000, 'Trang tra cứu của ban tổ chức đang có nhiều người truy cập nên phản hồi chậm. Bố mẹ vui lòng đợi thêm một chút nhé…'],
    [30000, 'Kết quả có thể mất vài phút mới về. Cú Pi Math lấy điểm trực tiếp từ trang tra cứu của ban tổ chức, '
      + 'nên khi trang này quá tải thì cần chờ lâu hơn. Bố mẹ vui lòng giữ nguyên trang, không cần tải lại nhé…']
  ];
  // Mọi lỗi (trang gốc quá tải, mất mạng, kết nối bị cắt…) → tự gọi lại sau khoảng nghỉ cho tới khi có kết quả,
  // trừ hết lượt trong ngày và thông tin sai (thử lại cũng vô ích). Nghỉ giữa các lần để không dội thêm tải cho trang gốc.
  var STOP_ERRORS = { CUPI_QUOTA: true, CUPI_BAD_REQUEST: true };
  var RETRY_MS = 15000;
  var RATE_RETRY_MS = 60000;
  var busy = false;
  var last = { key: '', data: null, at: 0 };
  var baseTitle = document.title;

  var ERRORS = {
    CUPI_RATE: 'Bạn tra hơi nhanh. Đợi khoảng 1 phút rồi thử lại nhé.',
    CUPI_QUOTA: 'Mạng của bạn đã tra quá nhiều lượt hôm nay. Bạn thử lại vào ngày mai nhé.',
    CUPI_BAD_REQUEST: 'Thông tin chưa đúng định dạng. Kiểm tra lại số điện thoại hoặc họ tên, ngày sinh.',
    CUPI_SERVER: 'Hiện trang tra cứu của ban tổ chức đang quá tải nên chưa trả kết quả. Cú Pi Math chỉ hiển thị điểm '
      + 'lấy trực tiếp từ ban tổ chức, rất mong bố mẹ thông cảm và thử lại sau ít phút ạ.'
  };

  // Trình duyệt có thể giữ lựa chọn "Tra theo" khi tải lại / quay lại trang → đồng bộ cả lúc mở trang.
  function syncFields() {
    var by = form.querySelector('input[name=by]:checked').value;
    form.querySelectorAll('[data-by]').forEach(function (el) { el.hidden = el.getAttribute('data-by') !== by; });
  }
  form.querySelectorAll('input[name=by]').forEach(function (r) { r.addEventListener('change', syncFields); });
  syncFields();

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    var by = form.querySelector('input[name=by]:checked').value;
    var payload = { exam: form.exam.value, by: by };
    var bad = by === 'phone' ? fillPhone(payload) : fillName(payload);
    if (!bad) return submit(payload);
    bad.input.setAttribute('aria-invalid', 'true');
    showMessage(bad.text, 'warn');
    bad.input.focus();
  });

  // Trả về { input, text } khi sai, null khi đúng (và điền vào payload).
  function fillPhone(p) {
    var d = form.phone.value.replace(/[\s.\-()]/g, '').replace(/^\+?84(?=\d{9}$)/, '0');
    if (!/^0\d{9}$/.test(d)) return { input: form.phone, text: 'Số điện thoại cần đủ 10 chữ số, VD: 0912 345 678.' };
    p.phone = d;
    return null;
  }

  function fillName(p) {
    var name = form.name.value.trim().replace(/\s+/g, ' ');
    if (name.split(' ').length < 2) return { input: form.name, text: 'Nhập đầy đủ họ và tên có dấu của con, VD: Nguyễn Minh An.' };
    if (!/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(form.birthday.value.trim())) {
      return { input: form.birthday, text: 'Ngày sinh nhập theo dạng ngày/tháng/năm, VD: 05/09/2017.' };
    }
    p.name = name;
    p.birthday = form.birthday.value.trim();
    return null;
  }

  // Tra lại đúng thông tin vừa tra → dùng lại kết quả, không gửi thêm request.
  function submit(payload) {
    var key = JSON.stringify(payload);
    if (key === last.key && last.data && Date.now() - last.at < REUSE_MS) return render(last.data, payload.by);
    var wait = last.at + COOLDOWN_MS - Date.now();
    if (wait > 0) return showMessage('Đợi ' + Math.ceil(wait / 1000) + ' giây rồi tra tiếp nhé.', 'info', true);
    payload.hp = form.hp ? form.hp.value : '';   // ô bẫy bot, người thật để trống
    lookup(payload, key);
  }

  function render(data, by) {
    if (data.status === 'found') return showFound(data.candidates);
    if (data.status === 'not_found') return showNotFound(by);
    showMessage(ERRORS[data.error] || ERRORS.CUPI_SERVER, 'warn', true);
  }

  // 0 = dừng (đã có kết quả, hết lượt, sai thông tin); còn lại là số ms nghỉ trước khi thử lại.
  function retryPause(data) {
    if (data.status || STOP_ERRORS[data.error]) return 0;
    if (data.error === 'CUPI_RATE') return RATE_RETRY_MS;
    return RETRY_MS;
  }

  function waitedText(started) {
    var min = Math.floor((Date.now() - started) / 60000);
    return min < 1 ? 'chưa tới 1 phút' : 'khoảng ' + min + ' phút';
  }

  function retryText(attempt, started, pause, error) {
    var why = error === 'NETWORK' ? 'Mạng đang chập chờn nên chưa gửi được yêu cầu.'
      : 'Trang tra cứu của ban tổ chức đang quá tải nên chưa trả kết quả.';
    return why + ' Cú Pi đang tự thử lại cho bố mẹ (lần '
      + attempt + ', đã chờ ' + waitedText(started) + (pause ? ', thử tiếp sau ' + Math.round(pause / 1000) + ' giây' : '')
      + '). Bố mẹ cứ để nguyên trang này, có kết quả sẽ hiện ngay ạ.';
  }

  // Giữ nút bấm được focus (aria-disabled thay vì disabled) để người dùng bàn phím không mất vị trí.
  function lookup(payload, key) {
    var started = Date.now();
    var attempt = 0;
    var timers = [];
    var ctrl = null;
    var stopped = false;
    busy = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = 'Đang tra cứu…';

    function clear() { timers.forEach(clearTimeout); timers = []; }
    function finish() { clear(); busy = false; btn.removeAttribute('aria-disabled'); btn.textContent = 'Xem điểm'; }
    function stop() {
      stopped = true;
      if (ctrl) ctrl.abort();
      finish();
      showMessage('Đã dừng tra cứu. Bố mẹ bấm Xem điểm để tra lại khi cần nhé.', 'info', true);
    }
    function wait(text) { showWaiting(text, stop); }

    function tryOnce() {
      attempt += 1;
      if (attempt === 1) {
        wait('Đang hỏi trang tra cứu của ban tổ chức…');
        timers = WAIT_NOTES.map(function (n) { return setTimeout(function () { wait(n[1]); }, n[0]); });
      } else {
        wait(retryText(attempt, started));
      }
      ctrl = window.AbortController ? new AbortController() : null;
      fetch(form.getAttribute('data-api'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (res) { return res.json().catch(function () { return { error: 'CUPI_SERVER' }; }); },
              function () { return { error: 'NETWORK' }; })
        .then(function (data) {
          if (stopped) return;
          clear();
          var pause = retryPause(data);
          if (pause) {
            wait(retryText(attempt + 1, started, pause, data.error));
            timers.push(setTimeout(tryOnce, pause));
            return;
          }
          finish();
          last = { key: data.status ? key : '', data: data.status ? data : null, at: Date.now() };
          render(data, payload.by);
          if (data.status && document.hidden) document.title = '✓ Đã có kết quả · ' + baseTitle;
        });
    }
    tryOnce();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) document.title = baseTitle;
  });

  // ---------- vẽ kết quả ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function showMessage(text, kind, focus) {
    var msg = el('p', 'lookup-msg lookup-msg-' + kind, text);
    out.replaceChildren(msg);
    if (focus) focusOn(msg);
  }

  // Thông báo đang chờ kèm nút Dừng nhỏ.
  function showWaiting(text, onStop) {
    var box = el('div', 'lookup-msg lookup-msg-info lookup-waiting');
    var stopBtn = el('button', 'lookup-stop', 'Dừng tra cứu');
    stopBtn.type = 'button';
    stopBtn.addEventListener('click', onStop);
    box.append(el('p', null, text), stopBtn);
    out.replaceChildren(box);
  }

  function focusOn(node) {
    node.setAttribute('tabindex', '-1');
    node.focus({ preventScroll: true });
    node.scrollIntoView({ behavior: SCROLL, block: 'start' });
  }

  // "NGUYỄN MINH AN" → "An": gọi con bằng tên trong lời chúc.
  function callName(full) {
    var word = String(full || '').trim().split(/\s+/).pop().toLocaleLowerCase('vi');
    return word ? word.charAt(0).toLocaleUpperCase('vi') + word.slice(1) : 'con';
  }

  // "84 / 100" hoặc "84" → { value: '84', max: '100' }; dạng lạ thì giữ nguyên chữ.
  function splitScore(raw) {
    var m = String(raw).match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+))?\s*$/);
    return m ? { value: m[1], max: m[2] || '100', num: Number(m[1].replace(',', '.')) } : { value: raw, max: '', num: NaN };
  }

  function notPassed(c) { return !!c.award && NOT_PASSED.test(c.award); }

  function cheer(c) {
    var who = callName(c.name);
    var s = c.score ? splitScore(c.score) : null;
    if (notPassed(c)) return who + ' đã cố gắng hết mình rồi. Mỗi kỳ thi là một bài học, lần sau mình làm tốt hơn nhé!';
    if (c.award) return 'Chúc mừng ' + who + ' đạt kết quả: ' + c.award + '! Cả nhà tự hào lắm đó.';
    if (s && s.num >= GREAT_SCORE) return 'Chúc mừng ' + who + ' đạt ' + s.value + ' điểm, một kết quả thật xuất sắc!';
    if (s) return 'Chúc mừng ' + who + ' đã hoàn thành bài thi với ' + s.value + ' điểm. Mỗi kỳ thi là một bước tiến!';
    return 'Ban tổ chức chưa cập nhật điểm của ' + who + '. Bố mẹ quay lại sau vài giờ nhé.';
  }

  // Lời mời nhỏ cuối thẻ, theo kết quả của từng bé.
  function nudge(c) {
    var who = callName(c.name);
    var text = notPassed(c) ? 'Cùng Cú Pi ôn lại cho ' + who + ' để lần sau tốt hơn'
      : c.score ? 'Luyện đề vòng quốc gia cho ' + who
      : 'Cho ' + who + ' luyện đề trong lúc chờ điểm';
    var a = el('a', 'lookup-nudge', text);
    a.href = '/app/';
    a.setAttribute('data-track', 'tra-cuu-the');
    return a;
  }

  function row(dl, label, value) {
    if (!value) return;
    dl.append(el('dt', null, label), el('dd', null, value));
  }

  function card(c) {
    var art = el('article', 'lookup-card' + (c.score ? ' has-score' : ''));
    var head = el('header', 'lookup-card-head');
    head.append(el('h3', null, c.name), el('span', 'lookup-sbd', 'SBD ' + c.sbd));
    var score = el('div', 'lookup-score');
    if (c.score) {
      var s = splitScore(c.score);
      score.append(el('b', null, s.value), el('small', null, s.max ? '/' + s.max + ' điểm' : 'điểm'));
    } else {
      score.append(el('span', 'pill pill-warn', 'Chưa có điểm'));
    }
    if (c.award) score.append(el('span', 'pill lookup-award', c.award));
    var dl = el('dl', 'lookup-info');
    row(dl, 'Khối', c.grade);
    row(dl, 'Trường', c.school);
    row(dl, 'Vòng thi', c.round);
    row(dl, 'Tỉnh thành', c.province);
    art.append(head, score, el('p', 'lookup-cheer', cheer(c)), dl, nudge(c));
    return art;
  }

  function invite(hasScore) {
    var box = el('aside', 'cta-box lookup-cta');
    var text = el('div');
    text.append(
      el('h2', null, hasScore ? 'Tiếp đà cho vòng quốc gia' : 'Trong lúc chờ điểm, ôn trước vòng quốc gia'),
      el('p', null, 'Vòng quốc gia TIMO thi đề tiếng Anh và chỉ ghi đáp số. Trên Cú Pi Math, con luyện đề thi thử vòng quốc gia '
        + 'đúng cấu trúc, có chú thích tiếng Việt và lời giải từng câu.'),
      el('p', null, 'Muốn con học toán tư duy đều đặn? Cú Pi có bài giảng từng dạng toán từ mầm non đến lớp 9, '
        + 'bố mẹ theo dõi được tiến độ của con.'));
    var a = el('a', 'btn', 'Tạo tài khoản học cho con');
    a.href = '/app/';
    a.setAttribute('data-track', 'tra-cuu-ket-qua');
    box.append(text, a);
    return box;
  }

  function showFound(list) {
    var hasScore = list.some(function (c) { return !!c.score; });
    var title = el('h2', 'lookup-result-title', list.length > 1 ? 'Tìm thấy ' + list.length + ' thí sinh' : 'Kết quả của con');
    var cards = el('div', 'lookup-cards');
    list.forEach(function (c) { cards.append(card(c)); });
    out.replaceChildren(title, cards, invite(hasScore));
    focusOn(title);
  }

  function showNotFound(by) {
    var tips = by === 'phone'
      ? 'Không tìm thấy thí sinh với số điện thoại này. Nếu con thi qua trường hoặc trung tâm, số đăng ký có thể là số của giáo viên. '
        + 'Bạn thử tra theo họ tên và ngày sinh nhé.'
      : 'Không tìm thấy thí sinh. Kiểm tra họ tên có đủ dấu và ngày sinh dạng ngày/tháng/năm, hoặc thử tra theo số điện thoại đăng ký.';
    showMessage(tips, 'warn', true);
  }
})();
