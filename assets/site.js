/* 主题、语言切换、滚动进度与指标卡高光。文案字典 i18n 见 assets/i18n.js（需先加载）。 */

function applyTheme(t) {
  document.documentElement.classList.toggle('theme-dark', t === 'dark');
  try { localStorage.setItem('theme', t); } catch (e) {}
  var btn = document.querySelector('.theme-toggle');
  if (btn) btn.setAttribute('aria-pressed', String(t === 'dark'));
}

function toggleTheme() {
  var isDark = document.documentElement.classList.contains('theme-dark');
  applyTheme(isDark ? 'light' : 'dark');
}

function scrollToTop() {
  var rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: rm ? 'auto' : 'smooth' });
}

function applyLang(lang) {
  var t = i18n[lang];
  if (!t) return;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  /* text, aria-label and alt text */
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    var key = el.getAttribute('data-i18n-aria');
    if (t[key] !== undefined) el.setAttribute('aria-label', t[key]);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
    var key = el.getAttribute('data-i18n-alt');
    if (t[key] !== undefined) el.setAttribute('alt', t[key]);
  });
  var portrait = document.querySelector('.portrait');
  if (portrait) portrait.alt = t.portraitAlt;
  /* meta tags */
  document.title = t.docTitle;
  var mDesc = document.querySelector('meta[name="description"]');
  if (mDesc) mDesc.content = t.metaDesc;
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = t.docTitle;
  var ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = t.metaDesc;
  var twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.content = t.docTitle;
  var twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.content = t.metaDesc;
  /* control buttons */
  var langBtn = document.querySelector('.lang-toggle');
  if (langBtn) langBtn.textContent = lang === 'zh' ? 'EN' : '中';
  var themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    themeBtn.setAttribute('aria-label', t.themeLabel);
    themeBtn.setAttribute('title', t.themeLabel);
  }
  var toTopBtn = document.querySelector('.to-top');
  if (toTopBtn) {
    toTopBtn.setAttribute('aria-label', lang === 'zh' ? '回到顶部' : 'Back to top');
    toTopBtn.setAttribute('title', lang === 'zh' ? '回到顶部' : 'Back to top');
  }
  try { localStorage.setItem('lang', lang); } catch (e) {}
}

function toggleLang() {
  var cur = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  applyLang(cur === 'zh' ? 'en' : 'zh');
}

(function () {
  var toTop = document.querySelector('.to-top');
  var bar = document.querySelector('.scroll-progress');
  var themeBtn = document.querySelector('.theme-toggle');
  var langBtn = document.querySelector('.lang-toggle');
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', String(document.documentElement.classList.contains('theme-dark')));
    themeBtn.addEventListener('click', toggleTheme);
  }
  if (langBtn) langBtn.addEventListener('click', toggleLang);
  if (toTop) toTop.addEventListener('click', scrollToTop);

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    if (toTop) toTop.classList.toggle('show', y > 400);
    if (bar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* restore saved language */
  try {
    if (localStorage.getItem('lang') === 'en') applyLang('en');
  } catch (e) {}

  /* 指标卡跟随鼠标高光（触摸设备无 pointermove hover，自然不触发） */
  document.querySelectorAll('.metric').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
})();
