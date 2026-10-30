// Hiệu ứng nhỏ cho trang công khai: viền header khi cuộn, hiện dần các khối khi cuộn tới.
// Không có JS thì trang vẫn hiển thị đầy đủ (class .js chỉ được gắn khi script chạy).
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mùa sự kiện (Halloween…): phần trang trí chỉ hiện trong khoảng ngày ghi ở data-season-from / -until
  var now = Date.now();
  document.querySelectorAll('[data-season-until]').forEach(function (el) {
    var from = Date.parse(el.getAttribute('data-season-from') || ''), until = Date.parse(el.getAttribute('data-season-until'));
    if (now < until && !(now < from)) el.hidden = false;
  });
  var calm = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (calm && document.querySelector('.season-ribbon:not([hidden])')) batsLater(9000);

  // Video mẫu trên trang chủ: nút phát to giữa khung, ẩn khi video đã chạy (dùng thanh điều khiển của trình duyệt)
  document.querySelectorAll('.video-box').forEach(function (box) {
    var v = box.querySelector('video'), btn = box.querySelector('.video-play');
    if (!v || !btn) return;
    v.controls = false; // ẩn thanh điều khiển gốc tới khi phát, để nút Phát lớn không bị chồng
    btn.addEventListener('click', function () { v.play(); });
    v.addEventListener('play', function () { box.classList.add('is-playing'); v.controls = true; });
  });

  firstTouch();
  track();

  var items = document.querySelectorAll('.reveal');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    items.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });

  // Mùa Halloween: thỉnh thoảng một đàn dơi nhỏ bay ngang trang, không nhận chuột / chạm.
  function batsLater(ms) {
    setTimeout(function () {
      if (!document.hidden) bats();
      batsLater(40000 + Math.random() * 35000);
    }, ms);
  }
  function bats() {
    var flock = document.createElement('div');
    flock.className = 'season-bats' + (Math.random() < 0.5 ? ' is-rtl' : '');
    flock.setAttribute('aria-hidden', 'true');
    flock.style.top = (10 + Math.random() * 35) + 'vh';
    flock.innerHTML = BAT + BAT + BAT;
    document.body.appendChild(flock);
    setTimeout(function () { flock.remove(); }, 9000);
  }
  var BAT = '<svg viewBox="0 0 60 42" width="60" height="42">'
    + '<g class="wing"><path d="M30 21 C22 8 10 6 1 12 C5 14 6 18 4 23 C9 21 12 24 13 28 C17 24 22 23 30 23 Z"/>'
    + '<path d="M30 21 C38 8 50 6 59 12 C55 14 54 18 56 23 C51 21 48 24 47 28 C43 24 38 23 30 23 Z"/></g>'
    + '<path class="body" d="M23 15 L24 6 L28.5 12 Z M37 15 L36 6 L31.5 12 Z"/><circle class="body" cx="30" cy="21" r="9.5"/>'
    + '<circle class="eye" cx="26.6" cy="20" r="3.1"/><circle class="eye" cx="33.4" cy="20" r="3.1"/>'
    + '<circle class="pupil" cx="27.3" cy="20.4" r="1.7"/><circle class="pupil" cx="34.1" cy="20.4" r="1.7"/>'
    + '<circle class="cheek" cx="24.2" cy="24.4" r="1.5"/><circle class="cheek" cx="35.8" cy="24.4" r="1.5"/>'
    + '<path class="smile" d="M28.4 25 q1.6 1.5 3.2 0"/></svg>';

  // Lần ghé đầu tiên (utm_source, trang giới thiệu) → app /app đọc cùng khoá khi phụ huynh đăng ký
  // (src/lib/attribution.ts). Chỉ lưu trong trình duyệt của phụ huynh, không gửi đi ở đây.
  function firstTouch() {
    try {
      if (localStorage.getItem('cupi.firstTouch')) return;
      localStorage.setItem('cupi.firstTouch', JSON.stringify({
        search: location.search, referrer: document.referrer, landing: location.href, at: new Date().toISOString()
      }));
    } catch (e) { /* chặn lưu trữ: bỏ qua */ }
  }

  // Đếm lượt bấm nút (data-track="vị trí") và lượt mở câu hỏi thường gặp → Supabase cu_app_track (0015).
  // Chỉ gửi vị trí nút, đích đến, câu hỏi — không cookie, không thông tin cá nhân.
  // site-config.js do scripts/publish_site.sh sinh; xem trang ở máy (không có file đó) thì không gửi gì.
  function track() {
    var cfg = window.CUPI_SITE;
    if (!cfg || !cfg.url || !cfg.key || !window.fetch) return;
    var sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
    var send = function (event, props) {
      try {
        fetch(cfg.url + '/rest/v1/rpc/cu_app_track', {
          method: 'POST', keepalive: true,   // keepalive: vẫn gửi xong khi trình duyệt chuyển sang /app
          headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_events: [{ event: event, props: props, session_id: sid, platform: 'web', app_version: 'site' }] })
        }).catch(function () {});
      } catch (e) { /* trình duyệt cũ: bỏ qua, trang vẫn chạy bình thường */ }
    };
    // bắt ở document: nút vẽ sau khi tải trang (thẻ kết quả tra điểm trong tra-cuu.js) cũng được đếm
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('[data-track]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      send('site_cta_click', { where: a.getAttribute('data-track'), target: href.indexOf('app') === 0 ? 'app' : href.slice(0, 40) });
    });
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        var q = d.querySelector('summary');
        if (d.open && q) send('site_faq_open', { q: q.textContent.trim().slice(0, 80) });
      });
    });
  }
})();
