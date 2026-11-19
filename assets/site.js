/* 语言切换（默认英文）、视频播放和竞赛页的任务切换。文案字典 i18n 见 assets/i18n.js（需先加载）。 */

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
  var langBtn = document.querySelector('.lang-toggle');
  if (langBtn) langBtn.textContent = lang === 'zh' ? 'EN' : '中';
  try { localStorage.setItem('lang', lang); } catch (e) {}
}

function toggleLang() {
  var cur = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  applyLang(cur === 'zh' ? 'en' : 'zh');
}

(function () {
  var langBtn = document.querySelector('.lang-toggle');
  if (langBtn) langBtn.addEventListener('click', toggleLang);

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

  /* 首页项目行：鼠标移上去就播放（这些视频没有声音），移开暂停。
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
})();
