# heliang-pu.github.io

Heliang Pu（蒲贺良）的个人主页 / 在线简历 —— FMC³ Robotics 具身智能算法工程师（VLA / WAM）、华东师范大学硕士在读。

🔗 **在线访问:** https://heliang-pu.github.io/

## 技术栈

- 纯静态页面，原生 HTML / CSS / JS，无框架依赖
- 部署：GitHub Pages（`main` 分支根目录，push 即自动发布）
- 特性：方格纸双栏卡片布局、深浅色主题切换、默认英文 / 可切换中文（i18n）、侧边栏滚动高亮与邮箱一键复制、JSON-LD 结构化数据、SEO（sitemap / robots / Open Graph）

## 本地预览

直接用浏览器打开 `index.html`，或起一个本地服务器：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 目录结构

```
index.html              # 首页（方格纸双栏卡片，首屏真机演示），静态文字是英文
projects.html           # 全部项目详情、能力矩阵与真机平台
competition.html        # RoboSynChallenge 十个任务：仿真与真机对照 + 比赛方法
heliang-pu-cv-en.pdf    # 英文 CV（PDF）
heliang-pu-resume.pdf   # 中文简历（PDF）
resume-src/             # 简历 HTML 源码与编译脚本
assets/
  site.css              # 全部样式（含深色模式）
  site.js               # 主题/语言切换、滚动高亮、邮箱复制、视频播放与竞赛页任务切换
  i18n.js               # 中英文案字典（data-i18n / data-i18n-aria / data-i18n-alt 引用的键）
  projects/             # 项目图片和视频
  competition/          # 竞赛页的视频、封面和首页小图
  publications/         # 论文综述机制分类总图
  logos/                # 真机平台 logo
  portrait.jpg          # 头像
scripts/stamp-assets.mjs  # 给页面里的样式、脚本地址加内容哈希
404.html  robots.txt  sitemap.xml  site.webmanifest
```

## 改文案

可翻译的文字都带 `data-i18n="键"`。页面默认英文：英文直接写在三个页面的 HTML 里（不等脚本就能显示，爬虫和分享卡片读到的也是英文），同一个键在 `assets/i18n.js` 的 `en` 和 `zh` 里各有一份，改英文时 HTML 和 `en` 保持一致。访客点右上角的「中」切到中文，浏览器会记住这个选择。中文文案里的技术术语（offline RL、rollout 等）和模型、产品名保留英文原文。测试会检查每个键在中英文里都存在，并检查页面里的静态文字、`<title>`、description、Open Graph 分享卡与 `en` 文案一致。

改完 `assets/site.css`、`assets/i18n.js` 或 `assets/site.js` 后运行：

```bash
node scripts/stamp-assets.mjs
```

它把三个页面里这几个文件的地址改成带内容哈希的（`?v=…`）。GitHub Pages 让浏览器把这些文件缓存十分钟，不加哈希的话，刚更新完刷新页面可能拿到新页面配旧文案，新加的内容切到中文时仍显示英文。忘了运行，测试会报错。

## 简历里的旧链接

简历 PDF 曾链接到 `#demos`、`#demo-01` … `#demo-09` 等 Demo 锚点。Demo 视频已从主页撤下，这些锚点改挂在对应的项目卡或「更多项目」条目上（`.legacy-anchor`），旧版简历里的链接仍能落到相关内容。GitHub Release `site-media` 里的旧视频已不再被页面引用。

## 测试

```bash
node --test tests/site-contract.test.mjs
```

测试会校验双语字典、静态英文一致性、资源哈希、媒体体积以及中英文两份简历 PDF 指向站点的所有锚点。
