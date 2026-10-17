'use strict';

const copy = {
  zh: {
    back:'← 返回个人主页', title:'让长任务的每一步都有迹可循。',
    lead:'从抓取到分拣，查看调度器如何检查执行结果、更新进度，并在抓空或掉落后恢复。',
    evidence:'模拟分拣 · 已记录的调度事件 · mock 规划器与执行器',
    episode:'记录', world:'分拣进度', plan:'规划', planHint:'技能与记忆', execute:'执行', verify:'校验', verifyHint:'结果更新进度',
    small:'小件', medium:'中件', large:'大件', sceneNote:'示意图依据事件记录更新，不代表机器人运动轨迹。',
    runtime:'运行记录', completed:'已校验分拣', calls:'技能调用', recoveries:'恢复事件', event:'当前事件', memory:'规划器记忆',
    memoryNote:'保留原始记忆；它可能滞后一轮，完成进度以校验后的记录为准。', prompt:'当前技能指令',
    play:'播放回放', pause:'暂停', previous:'上一步', next:'下一步', jump:'跳到失败恢复', speed:'速度', timeline:'回放时间线',
    loading:'正在加载记录…', loaded:'记录已加载，可播放、逐步查看或跳到恢复事件。', error:'记录加载失败，请刷新页面重试。',
    aboutTitle:'连接规划与执行', aboutText:'VLM 决定下一步，VLA / WAM 执行子任务。Harness 管理指令、校验、恢复与轨迹，模型通过独立服务接入。',
    boundaryTitle:'这段回放展示什么', boundaryText:'这是模拟分拣环境的历史调度记录，展示运行时机制。它不用于衡量真实机器人或训练后模型的成功率。',
    withRecovery:'抓空与掉落恢复', clean:'完成分拣', ready:'准备', running:'执行中', success:'校验通过', failure:'失败', recovery:'恢复中', done:'任务完成',
    pick:'抓取', place:'放置', flip:'翻面', retract:'撤回', start:'开始调度', ledger:'校验通过，更新分拣进度',
    retry:'抓空 → 撤回 → 重试', replan:'物体掉落 → 重新规划', finish:'全部 10 个包裹已完成校验', empty_grasp:'抓空', dropped:'物体掉落'
  },
  en: {
    back:'← Back to portfolio', title:'Every step of a long task, made traceable.',
    lead:'Follow the scheduler as it verifies skills, records progress, and recovers from empty grasps or dropped objects.',
    evidence:'Simulated sorting · Recorded events · Mock planner and executor',
    episode:'Record', world:'Sorting progress', plan:'Plan', planHint:'Skill + memory', execute:'Execute', verify:'Verify', verifyHint:'Update progress',
    small:'Small', medium:'Medium', large:'Large', sceneNote:'This symbolic view follows recorded events; it does not show robot motion.',
    runtime:'Runtime trace', completed:'Verified packages', calls:'Skill calls', recoveries:'Recoveries', event:'Current event', memory:'Planner memory',
    memoryNote:'Original memory may lag by one decision. Verified records determine completion.', prompt:'Current skill instruction',
    play:'Play replay', pause:'Pause', previous:'Previous', next:'Next', jump:'Jump to recovery', speed:'Speed', timeline:'Replay timeline',
    loading:'Loading recorded events…', loaded:'Ready to play, step through, or jump to a recovery event.', error:'Unable to load the record. Refresh to try again.',
    aboutTitle:'Connecting planning and execution', aboutText:'A VLM plans the next step; a VLA or WAM executes it. Harness manages instructions, verification, recovery, and traces through independent model services.',
    boundaryTitle:'What this replay demonstrates', boundaryText:'Historical scheduler events from a mock sorting environment demonstrate runtime mechanisms. This is not a real-robot or trained-model benchmark.',
    withRecovery:'Empty-grasp and drop recovery', clean:'Sorting completed', ready:'Ready', running:'Executing', success:'Verified', failure:'Failed', recovery:'Recovering', done:'Task complete',
    pick:'Pick', place:'Place', flip:'Flip', retract:'Retract', start:'Start scheduling', ledger:'Verification passed; update progress',
    retry:'Empty grasp → retract → retry', replan:'Dropped object → replan', finish:'All 10 packages verified', empty_grasp:'Empty grasp', dropped:'Dropped object'
  }
};
const $ = id => document.getElementById(id);
let lang = new URLSearchParams(location.search).get('lang');
try { lang = lang || localStorage.getItem('lang'); } catch {}
lang = lang === 'en' ? 'en' : 'zh';
let episodes = [], episode, index = 0, playing = false, playhead = 0, lastTick = 0, failed = false, animationFrame = null;

function translatedMemory(text) {
  if (lang === 'zh') return text || '—';
  const match = text.match(/已放 A (\d+) 个、B (\d+) 个、C (\d+) 个；桌上还剩 (\d+) 个/);
  return match ? `Placed A: ${match[1]}, B: ${match[2]}, C: ${match[3]}; ${match[4]} left on table.` : text || '—';
}

function describe(frame) {
  const t = copy[lang], skill = t[frame.skill] || frame.skill;
  if (frame.event === 'recovery') return frame.action === 'retry' ? t.retry : t.replan;
  if (frame.event === 'episode_start') return t.start;
  if (frame.event === 'episode_end') return t.finish;
  if (frame.event === 'ledger_update') return t.ledger;
  const target = frame.bin ? ` → ${frame.bin}` : '';
  const result = frame.event === 'skill_start' ? t.running : t[frame.status] || frame.status;
  return `${skill}${target} · ${result}${frame.reason ? ` · ${t[frame.reason] || frame.reason}` : ''}`;
}

function render() {
  const t = copy[lang];
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = `Embodied Harness · ${lang === 'en' ? 'Task replay' : '任务回放'}`;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t[el.dataset.i18n]; });
  $('language').textContent = lang === 'zh' ? 'EN' : '中文';
  $('load-status').textContent = failed ? t.error : episode ? t.loaded : t.loading;
  $('play').textContent = playing ? t.pause : t.play;
  for (let i = 0; i < episodes.length; i++) {
    $('episode').options[i].textContent = `${i === 0 ? t.withRecovery : t.clean} · seed ${episodes[i].seed}`;
  }
  if (!episode) return;
  const f = episode.frames[index], count = Object.values(f.sorted).reduce((a,b) => a+b, 0);
  $('record-date').textContent = episode.recordedAt;
  $('state').textContent = t[f.status] || f.status;
  $('state').classList.toggle('warning', ['failure','recovery'].includes(f.status));
  $('clock').textContent = `${f.t.toFixed(1)} / ${episode.duration.toFixed(1)} s`;
  $('sequence').textContent = `#${f.seq}`;
  $('progress').textContent = `${count} / ${episode.total}`;
  $('calls').textContent = f.calls;
  $('recoveries').textContent = f.recoveries;
  $('event-text').textContent = describe(f);
  $('event-text').classList.toggle('warning', ['failure','recovery'].includes(f.status));
  $('memory').textContent = translatedMemory(f.memory);
  $('prompt').textContent = f.prompt || '—';
  $('active-skill').textContent = (t[f.skill] || f.skill || '—') + (f.bin ? ` → ${f.bin}` : '');
  for (const bin of ['A','B','C']) $('bin-'+bin.toLowerCase()).textContent = f.sorted[bin];
  [...$('packages').children].forEach((el,i) => el.classList.toggle('sorted',i < count));
  const active = f.event === 'ledger_update' || f.event === 'skill_end' || f.event === 'episode_end' ? 'verify' : f.event === 'recovery' || f.event === 'episode_start' ? 'plan' : 'execute';
  document.querySelectorAll('[data-node]').forEach(el => el.classList.toggle('active',el.dataset.node === active));
  $('timeline').value = index;
  $('step').textContent = `${index+1} / ${episode.frames.length}`;
  $('previous').disabled = index === 0;
  $('next').disabled = index === episode.frames.length-1;
  $('recovery').disabled = !episode.frames.some(f => f.event === 'recovery');
}

function pause() {
  playing = false;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  $('play').setAttribute('aria-pressed','false');
}
function seek(next) {
  pause(); index = Math.max(0,Math.min(episode.frames.length-1,next));
  playhead = episode.frames[index].t; render();
}
function tick(now) {
  animationFrame = null;
  if (!playing) return;
  playhead += Math.min(now-lastTick,500)/1000 * Number($('speed').value);
  lastTick = now;
  while (index+1 < episode.frames.length && episode.frames[index+1].t <= playhead) index++;
  if (index === episode.frames.length-1) pause();
  render();
  if (playing) animationFrame = requestAnimationFrame(tick);
}
$('play').addEventListener('click', () => {
  if (playing) { pause(); render(); return; }
  if (index === episode.frames.length-1) seek(0);
  playing = true; lastTick = performance.now(); $('play').setAttribute('aria-pressed','true'); render(); animationFrame = requestAnimationFrame(tick);
});
$('previous').addEventListener('click', () => seek(index-1));
$('next').addEventListener('click', () => seek(index+1));
$('timeline').addEventListener('input', event => seek(Number(event.target.value)));
$('recovery').addEventListener('click', () => {
  let target = episode.frames.findIndex((f,i) => i > index && f.event === 'recovery');
  if (target < 0) target = episode.frames.findIndex(f => f.event === 'recovery');
  if (target >= 0) seek(target);
});
$('episode').addEventListener('change', () => { episode = episodes[Number($('episode').value)]; $('timeline').max = episode.frames.length-1; seek(0); });
$('language').addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; try { localStorage.setItem('lang',lang); } catch {} render(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); render(); } });
render();
fetch('harness-trace.json').then(response => {
  if (!response.ok) throw new Error('Trace unavailable');
  return response.json();
}).then(data => {
  if (data.schemaVersion !== 1 || !data.episodes?.length) throw new Error('Invalid trace');
  episodes = data.episodes;
  for (let i = 0; i < episodes.length; i++) $('episode').add(new Option('',String(i)));
  episode = episodes[0];
  $('packages').replaceChildren(...Array.from({length:episode.total}, () => { const span = document.createElement('span'); span.className = 'package'; return span; }));
  $('timeline').max = episode.frames.length-1;
  ['episode','play','next','previous','recovery','timeline'].forEach(id => { $(id).disabled = false; });
  render();
}).catch(() => { failed = true; render(); });
