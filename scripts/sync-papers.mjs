#!/usr/bin/env node
/**
 * 同步本地论文库到站点数据。
 *
 * 用法:
 *   node scripts/sync-papers.mjs [README 路径]
 *
 * 读取 ~/study/README.md（8 个论文大类 + 电子书），解析每条论文的
 * 标题 / 时间 / arXiv / 已读状态 / 简介，过滤私人备注（导师推荐等），
 * 生成 assets/papers.json 供 index.html 的论文库板块懒加载渲染。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SOURCE = process.argv[2] ?? `${homedir()}/study/README.md`;
const OUTPUT = fileURLToPath(new URL('../assets/papers.json', import.meta.url));

// 只收录这些大类；README 中的 目录导航 / 相关资料 / 阅读建议 等私人段落一律跳过。
const GROUP_NAMES = {
  '一': null, '二': null, '三': null, '四': null,
  '五': null, '六': null, '七': null, '八': null,
};

const GROUP_EN = {
  'VLA — 视觉-语言-动作模型': 'VLA — Vision-Language-Action Models',
  '策略学习与模仿学习': 'Policy Learning & Imitation',
  'WAM — 世界模型 / 世界动作模型': 'World Models / World-Action Models',
  '强化学习（RL）': 'Reinforcement Learning',
  '大语言模型与对齐（LLM）': 'LLMs & Alignment',
  '基础架构与表征': 'Architectures & Representations',
  '触觉传感与表征': 'Tactile Sensing & Representation',
  '数据集与采集接口': 'Datasets & Collection Interfaces',
  '电子书': 'Textbooks',
};

const SERIES_EN = {
  'Physical Intelligence π 系列': 'Physical Intelligence π series',
  'NVIDIA GR00T 系列': 'NVIDIA GR00T series',
  'Qwen-Robot 系列': 'Qwen-Robot series',
  'Gemini Robotics 系列': 'Gemini Robotics series',
  'ForceVLA 与触觉 / 力觉 VLA': 'ForceVLA & tactile / force VLA',
  'Robotics Transformer（RT）系列': 'Robotics Transformer (RT) series',
  '通用 / 其他 VLA': 'General / other VLA',
  '经典算法与理论': 'Classic algorithms & theory',
  '具身 / VLA 强化学习与系统': 'Embodied / VLA RL & systems',
  'GPT 系列': 'GPT series',
  '对齐方法': 'Alignment methods',
  '其他基础与推理工作': 'Other foundations & reasoning',
  '多模态与通用基础架构': 'Multimodal & general architectures',
  '生成式策略基础': 'Generative policy foundations',
  'JEPA 系列': 'JEPA series',
  'Sparsh 系列': 'Sparsh series',
  '其他触觉传感器': 'Other tactile sensors',
};

// 私人备注过滤：整句剔除的关键词 + 标签里要剥掉的括注。
const PRIVATE_SENTENCE = /导师|你已有|你的|面试/;
const PRIVATE_LABEL = /[（(]导师推荐[）)]/g;

// ── 招聘视角的策展数据（论文 ↔ 工程产出）────────────────────────────
// 已上真机：这些论文对应的方法/模型在真实机器人项目里用过，
// 页面上显示「已上真机」徽章并跳到对应板块。按 arXiv 号匹配。
const DEPLOYED = {
  '2410.24164': '#projects', // π0 → S101 三策略对比
  '2504.16054': '#projects', // π0.5 → 双臂 + 触觉项目
  '2511.14759': '#projects', // π0.6 RECAP → 手机插拔旗舰项目
  '2304.13705': '#projects', // ACT → S101 对比
  '2303.04137': '#projects', // Diffusion Policy → S101 对比
  '2503.14734': '#projects', // GR00T N1 → 傅利叶 GR2 集成
  '2506.07339': '#demos',    // RTC → π0.5 JAX 异步推理 + RTC demo
};

// 精读重点：板块顶部的 4-6 张卡，一句话讲清「读了 → 产出了什么」。
// 按条目标签前缀匹配（README 重排不影响，改名会触发 warning）。
const FEATURED = [
  {
    match: 'π0.6 -',
    href: '#projects',
    zh: '在松灵 PiperX 真机复现 RECAP 自改进闭环：自主 rollout + 专家纠错 + Offline RL，任务吞吐约 2×。',
    en: 'Reproduced the RECAP self-improvement loop on a real PiperX arm—autonomous rollouts, expert corrections, Offline RL, ≈2× throughput.',
  },
  {
    match: 'π0.5 -',
    href: '#projects',
    zh: '部署到双臂平台并融合触觉编码与异步推理，精细操作成功率 30% → 70%。',
    en: 'Deployed on a dual-arm rig with tactile encoding and async inference—fine-manipulation success 30% → 70%.',
  },
  {
    match: 'Diffusion Policy -',
    href: '#projects',
    zh: '与 ACT、π0 在 500+ 条真机示教上完成三策略对比，从训练一路做到真机部署。',
    en: 'Benchmarked against ACT and π0 on 500+ real demonstrations, from training through real-robot deployment.',
  },
  {
    match: 'DreamZero -',
    zh: 'WAM 零样本策略代表作，逐段精读并产出全文中文译稿。',
    en: 'Zero-shot world-action-model milestone—close-read with a full Chinese translation produced.',
  },
  {
    match: 'Cosmos 3 -',
    zh: '精读 138 页全模态世界模型报告并成文技术解读；其模态不含触觉——正是我的切入方向。',
    en: 'Deep-read the 138-page omnimodal report and wrote a breakdown; its missing tactile modality is exactly my angle.',
  },
  {
    match: 'Qwen-RobotManip -',
    zh: '跟进最新工业级 VLA 技术报告，整理成技术解读笔记。',
    en: 'Tracked this latest industrial-grade VLA report and wrote a technical breakdown.',
  },
];

const warnings = [];
const warn = (message) => warnings.push(message);

function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](link) -> text
    .replace(/\*\*/g, '')
    .trim();
}

function cleanSummary(raw, where) {
  const flat = stripMarkdown(raw);
  const sentences = flat.split(/(?<=。)/);
  const kept = sentences.filter((sentence) => !PRIVATE_SENTENCE.test(sentence));
  if (kept.length !== sentences.length) {
    warn(`过滤私人备注: ${where}`);
  }
  return kept.join('').trim();
}

function normalizeTime(raw, where) {
  const ym = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (ym) return `${ym[1]}.${ym[2].padStart(2, '0')}`;
  const y = raw.match(/(\d{4})\s*年?/);
  if (y) return y[1];
  warn(`无法解析时间 "${raw}": ${where}`);
  return raw.trim();
}

function parse(markdown) {
  const lines = markdown.split('\n');
  const groups = [];
  let group = null;
  let seriesIndex = -1;
  let item = null;

  const closeItem = () => {
    if (!item) return;
    const where = `${group.zh} / ${item.label}`;
    for (const field of ['title', 'time', 'summary']) {
      if (!item[field]) throw new Error(`条目缺少 ${field}: ${where}`);
    }
    if (item.read === undefined) throw new Error(`条目缺少已读复选框: ${where}`);
    item.summary = cleanSummary(item.summary, where);
    item.time = normalizeTime(item.time, where);
    if (item.arxiv && !/^\d{4}\.\d{4,5}$/.test(item.arxiv)) {
      warn(`忽略非标准 arXiv 号 "${item.arxiv}": ${where}`);
      delete item.arxiv;
    }
    group.items.push(item);
    item = null;
  };

  for (const line of lines) {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      closeItem();
      const text = heading[1];
      const numbered = text.match(/^([一二三四五六七八])、(.+)$/);
      const isBooks = text === '电子书';
      if (numbered && numbered[1] in GROUP_NAMES) {
        group = { zh: numbered[2].trim(), series: [], items: [] };
      } else if (isBooks) {
        group = { zh: '电子书', series: [], items: [] };
      } else {
        group = null; // 目录导航 / 使用说明 / 相关资料 / 阅读建议 …
        continue;
      }
      if (!(group.zh in GROUP_EN)) {
        warn(`分类缺少英文名，沿用中文: ${group.zh}`);
      }
      group.en = GROUP_EN[group.zh] ?? group.zh;
      seriesIndex = -1;
      groups.push(group);
      continue;
    }
    if (!group) continue;

    const series = line.match(/^\*\*▍(.+?)\*\*\s*$/);
    if (series) {
      closeItem();
      const zh = series[1].trim();
      if (!(zh in SERIES_EN)) warn(`系列缺少英文名，沿用中文: ${zh}`);
      group.series.push({ zh, en: SERIES_EN[zh] ?? zh });
      seriesIndex = group.series.length - 1;
      continue;
    }

    const entry = line.match(/^### \d+\.\s*(.+?)\s*$/);
    if (entry) {
      closeItem();
      item = { label: entry[1].replace(PRIVATE_LABEL, '').trim() };
      if (seriesIndex >= 0) item.s = seriesIndex;
      continue;
    }
    if (!item) continue;

    const checkbox = line.match(/^- \[([ x])\] 已读/);
    if (checkbox) {
      item.read = checkbox[1] === 'x';
      continue;
    }

    const field = line.match(/^\*\*(.+?)\*\*[:：]\s*(.+?)\s*$/);
    if (field) {
      const [, name, value] = field;
      if (name === '标题') item.title = stripMarkdown(value);
      else if (name === '时间') item.time = value;
      else if (name === 'arXiv') item.arxiv = value.trim();
      else if (name === '会议') item.venue = stripMarkdown(value);
      else if (name === '作者') item.authors = stripMarkdown(value);
      else if (name === 'DOI') item.doi = value.trim();
      else if (name === '简介') item.summary = value;
      else if (name === '笔记' || name === '翻译') item.notes = true; // 只标记有产出，不链接本地文件
      // 文件 / 配套资源 / 来源 / 版本说明… 一律不上站。
    }
  }
  closeItem();
  return groups;
}

const markdown = await readFile(SOURCE, 'utf8');
const groups = parse(markdown);

for (const group of groups) {
  group.read = group.items.filter((paper) => paper.read).length;
}
const total = groups.reduce((sum, current) => sum + current.items.length, 0);
const read = groups.reduce((sum, current) => sum + current.read, 0);

const declared = markdown.match(/^共 (\d+) 项/m);
if (declared && Number(declared[1]) !== total) {
  warn(`README 声明共 ${declared[1]} 项，实际解析到 ${total} 项`);
}
if (total < 50) throw new Error(`仅解析到 ${total} 条，疑似 README 结构变化`);

// 策展数据挂载：已上真机徽章 + 精读重点。
const allItems = groups.flatMap((current) => current.items);
let deployed = 0;
for (const [arxiv, href] of Object.entries(DEPLOYED)) {
  const item = allItems.find((paper) => paper.arxiv === arxiv);
  if (!item) {
    warn(`DEPLOYED 未匹配到 arXiv ${arxiv}，已跳过`);
    continue;
  }
  item.deployed = href;
  deployed += 1;
}

const featured = [];
for (const pick of FEATURED) {
  const item = allItems.find((paper) => paper.label.startsWith(pick.match));
  if (!item) {
    warn(`FEATURED 未匹配到 "${pick.match}"，已跳过`);
    continue;
  }
  featured.push({
    label: item.label,
    title: item.title,
    ...(item.arxiv ? { arxiv: item.arxiv } : {}),
    ...(pick.href ? { href: pick.href } : {}),
    zh: pick.zh,
    en: pick.en,
  });
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  total,
  read,
  deployed,
  featured,
  groups,
};

const json = `${JSON.stringify(payload, null, 1)}\n`;
if (/导师|你已有/.test(json)) {
  throw new Error('输出中仍残留私人备注，请检查过滤规则');
}

await writeFile(OUTPUT, json);

for (const message of warnings) console.warn(`[warn] ${message}`);
console.log(
  `papers.json 已生成: ${total} 项（已读 ${read}）· ${groups.length} 个分类 · ${(json.length / 1024).toFixed(1)} KB`,
);
console.log(groups.map((g) => `  ${g.zh}: ${g.read}/${g.items.length}`).join('\n'));
