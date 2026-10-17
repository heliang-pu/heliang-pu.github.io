# heliang-pu.github.io

蒲贺良的个人主页 / 在线简历 —— 具身智能 / VLA 全栈工程师。

🔗 **在线访问:** https://heliang-pu.github.io/

## 技术栈

- 纯静态单页，原生 HTML / CSS / JS，无构建步骤、无框架依赖
- 部署：GitHub Pages（`main` 分支根目录，push 即自动发布）
- 特性：中英双语 i18n、暗色模式、响应式布局、JSON-LD 结构化数据、SEO（sitemap / robots / Open Graph）

## 本地预览

直接用浏览器打开 `index.html`，或起一个本地服务器：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 目录结构

```
index.html              # 页面结构，中文为默认文案
heliang-pu-resume.pdf   # 简历
assets/
  site.css              # 全部样式
  site.js               # 主题、语言切换、滚动进度、指标卡高光
  i18n.js               # 中英文案字典（data-i18n / data-i18n-aria / data-i18n-alt 引用的键）
  projects/             # 项目卡上的真机截图
  logos/                # 真机平台 logo
  fonts/                # 自托管字体（拉丁子集）
  portrait.jpg          # 头像
404.html  robots.txt  sitemap.xml  site.webmanifest
```

## 改文案

可翻译的文字都带 `data-i18n="键"`：中文直接写在 `index.html` 里（首屏不等脚本就能显示），同一个键在 `assets/i18n.js` 的 `zh` 和 `en` 里各有一份，改中文时两处保持一致。测试会检查每个键在中英文里都存在，并检查 `<title>`、description、Open Graph 分享卡与 `zh` 文案一致（微信等爬虫只读静态 HTML）。

## 简历里的旧链接

简历 PDF 曾链接到 `#demos`、`#demo-01` … `#demo-09` 等 Demo 锚点。Demo 视频已从主页撤下，这些锚点改挂在对应的项目卡或「更多项目」条目上（`.legacy-anchor`），旧版简历里的链接仍能落到相关内容。GitHub Release `site-media` 里的旧视频已不再被页面引用。

## 测试

```bash
node --test tests/site-contract.test.mjs
```

测试会解析简历 PDF 里指向主页的链接，逐个确认锚点存在。
