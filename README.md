# heliang-pu.github.io

蒲贺良的个人主页 / 作品集 —— 具身智能 / VLA 全栈工程师。

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

## 近期 Demo（2026-10）

- `demo12-sim2real.mp4`：PiPER 双臂 sim2real 左右对照，约 23 秒、1280×720。左侧为孪生场景的官方专家示范（原速，结束后保持末帧），右侧为混训策略的真机成功回合（2 倍速）；两个独立回合，画面内有中英文标注。
- `demo13.mp4`：BEHAVIOR-1K 微波炉爆米花复现，约 91 秒，使用 [IliaLarchenko/behavior-1k-solution](https://github.com/IliaLarchenko/behavior-1k-solution) 的公开代码和权重；本地首轮 10 个实例成功 4 个。
- `demos/embodied-harness.html`：中英双语交互回放，支持逐步查看、时间线与失败恢复跳转。`harness-trace.json` 从 Embodied Harness 的 `runs/demo/ep_0001`、`ep_0002` 记录中导出，仅保留展示所需的事件字段。

Harness 回放使用 `mock_sorting` 环境、`mock_oracle` 规划器与 mock 执行器，展示运行时调度机制。它不是真机录像，也不作为训练后模型的性能指标。

检查主页与回放的数据约定：

```bash
node --test tests/site-contract.test.mjs tests/recent-demos.test.mjs
```
