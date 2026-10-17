import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [index, replay, traceText] = await Promise.all([
  read('index.html'), read('demos/embodied-harness.html'), read('demos/harness-trace.json'),
]);
const trace = JSON.parse(traceText);
const dictionary = vm.runInNewContext('(' + index.match(/var i18n = (\{[\s\S]*?\n    \});/)[1] + ')');

test('new demo entries link to two playable videos and one bilingual interactive replay', () => {
  for (const id of ['10', '11', '12']) {
    assert.match(index, new RegExp(`id="demo-${id}"`));
    const card = index.match(new RegExp(`<article class="demo-card[^\"]*" id="demo-${id}">[\\s\\S]*?</article>`))[0];
    for (const [, key] of card.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)) {
      for (const lang of ['zh', 'en']) assert.ok(dictionary[lang][key], `${lang}: ${key}`);
    }
    if (id === '11') {
      assert.match(card, /href="demos\/embodied-harness.html\?lang=zh"/);
      assert.match(card, /data-demo-lang/);
      assert.doesNotMatch(card, /<video/);
    } else {
      assert.match(card, /preload="none"/);
      assert.match(card, /site-media\/(?:demo12-sim2real|demo13)\.mp4/);
    }
  }
  assert.match(replay, /mock 规划器与执行器/);
  assert.match(dictionary.zh.demo13Platform, /仿真/);
  assert.match(dictionary.zh.demo13Mode, /4 \/ 10/);
});

test('recorded replay only advances verified progress on ledger updates', () => {
  assert.equal(trace.environment, 'mock_sorting');
  for (const episode of trace.episodes) {
    assert.equal(episode.planner, 'mock_oracle');
    assert.equal(episode.executor, 'mock');
    let count = 0, time = 0, seq = 0;
    for (const frame of episode.frames) {
      const next = Object.values(frame.sorted).reduce((a, b) => a + b, 0);
      assert.ok(frame.t >= time && frame.seq > seq);
      assert.ok(next >= count && next <= episode.total);
      if (next !== count) assert.equal(frame.event, 'ledger_update');
      count = next; time = frame.t; seq = frame.seq;
    }
    assert.equal(count, episode.total);
    assert.equal(time, episode.duration);
    assert.equal(episode.frames.at(-1).status, 'done');
  }
});

test('recovery record preserves both retract-and-retry and replanning decisions', () => {
  const recovery = trace.episodes[0].frames.filter(f => f.event === 'recovery');
  assert.deepEqual(recovery.map(f => [f.reason, f.action]), [
    ['empty_grasp', 'retry'], ['dropped', 'planner'],
  ]);
  assert.deepEqual(recovery[0].beforeRetry, ['retract']);
  assert.equal(trace.episodes[0].frames.at(-1).recoveries, 2);
  assert.equal(trace.episodes[1].frames.at(-1).recoveries, 0);
});
