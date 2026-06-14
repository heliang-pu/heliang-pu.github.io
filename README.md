# heliang-pu.github.io

蒲贺良的个人主页 / 作品集 —— 具身智能 / VLA 工程师。

🔗 **在线访问:** https://heliang-pu.github.io/

## 技术栈

- 纯静态单页（`index.html`），原生 HTML + 内联 CSS / JS，无构建步骤、无框架依赖
- 部署：GitHub Pages（`main` 分支根目录，push 即自动发布）
- 特性：中英双语 i18n、暗色模式、响应式布局、JSON-LD 结构化数据、SEO（sitemap / robots / Open Graph）

## 本地预览

直接用浏览器打开 `index.html`，或起一个本地服务器（视频走外链，本地也能播）：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 目录结构

```
index.html              # 全部页面（结构 + 样式 + 脚本 + i18n 文案）
heliang-pu-resume.pdf   # 简历
assets/
  posters/              # demo 视频缩略图（首屏显示，视频懒加载前的封面）
  logos/                # 真机平台 logo
  videos/               # demo 视频源文件（本地保留，已 gitignore，不提交）
  portrait.jpg          # 头像
404.html  robots.txt  sitemap.xml  site.webmanifest
```

## 视频托管

demo 视频**不放进 git**（二进制会撑大仓库），而是作为 GitHub Release **`site-media`** 的 assets 托管，`index.html` 通过 `<source data-src="...">` + IntersectionObserver 懒加载引用。

替换 / 新增视频：

```bash
gh release upload site-media demoN.mp4 --clobber   # 覆盖上传，勿 git add 视频
```

新文件名需与 `index.html` 中的 release URL 对应。
