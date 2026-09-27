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
    document.querySelectorAll('[data-track]').forEach(function (a) {
      a.addEventListener('click', function () {
        var href = a.getAttribute('href') || '';
        send('site_cta_click', { where: a.getAttribute('data-track'), target: href.indexOf('app') === 0 ? 'app' : href.slice(0, 40) });
      });
    });
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        var q = d.querySelector('summary');
        if (d.open && q) send('site_faq_open', { q: q.textContent.trim().slice(0, 80) });
      });
    });
  }
})();
