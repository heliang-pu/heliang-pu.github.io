/* 主题切换、语言切换（默认英文）、滚动进度、视频播放、指标卡高光与竞赛页任务切换。
   文案字典 i18n 见 assets/i18n.js（需先加载）。 */

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
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  /* meta tags：其他页面在 <body> 上用 data-i18n-title / data-i18n-desc 指定自己的键，默认是首页的 */
  var titleKey = document.body.getAttribute('data-i18n-title');
  var descKey = document.body.getAttribute('data-i18n-desc');
  var title = titleKey ? t[titleKey] : t.docTitle;
  var desc = descKey ? t[descKey] : t.metaDesc;
  document.title = title;
  var mDesc = document.querySelector('meta[name="description"]');
  if (mDesc) mDesc.content = desc;
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = title;
  var ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = desc;
  var twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.content = title;
  var twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.content = desc;
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
    toTopBtn.setAttribute('aria-label', t.toTopLabel);
    toTopBtn.setAttribute('title', t.toTopLabel);
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

  /* 页面默认英文（静态文字就是英文）；之前切到中文的访客，下次进来还是中文 */
  try {
    if (localStorage.getItem('lang') === 'zh') applyLang('zh');
  } catch (e) {}

  /* 一次只播一段视频（首页、项目页、竞赛页） */
  var clips = document.querySelectorAll('video');
  clips.forEach(function (video) {
    video.addEventListener('play', function () {
      clips.forEach(function (other) {
        if (other !== video) other.pause();
      });
    });
  });

  /* 首页项目卡片：鼠标移上去就播放（这些视频没有声音），移开暂停。
     触屏和减少动态效果的设置下不自动播，照常点播放按钮。 */
  var canHover = window.matchMedia && matchMedia('(hover: hover)').matches &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canHover) {
    document.querySelectorAll('[data-hover-play]').forEach(function (row) {
      var video = row.querySelector('video');
      if (!video) return;
      row.addEventListener('mouseenter', function () {
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () {});
      });
      row.addEventListener('mouseleave', function () {
        video.pause();
      });
    });
  }

  /* 竞赛页：按地址里的 #任务 只显示这一个任务；没有 JS 时十个任务依次排开。
     #task-tabs、#tasks 这类不是任务的锚点不切换，留在当前任务。 */
  var panels = [].slice.call(document.querySelectorAll('.task-panel'));
  if (panels.length) {
    var tabs = [].slice.call(document.querySelectorAll('.task-tabs a'));
    var current = null;
    var showTask = function () {
      var id = decodeURIComponent(location.hash.slice(1));
      var match = panels.filter(function (panel) { return panel.id === id; })[0];
      if (!match && current) return;
      current = match || panels[0];
      panels.forEach(function (panel) { panel.hidden = panel !== current; });
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('href') === '#' + current.id;
        tab.classList.toggle('active', on);
        if (on) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      });
      clips.forEach(function (video) {
        if (!current.contains(video)) video.pause();
      });
    };
    window.addEventListener('hashchange', showTask);
    showTask();
  }

  /* 指标卡跟随鼠标高光（触摸设备无 pointermove hover，自然不触发） */
  document.querySelectorAll('.metric').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
})();
