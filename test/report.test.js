// 审计上报裁决（第三刀）—— 不发网络、不读文件，进 `npm test`
//
// 上报是"额外再发一份到合规系统"，本地日志永远先写。这条链路最容易静默坏掉的
// 几头：① 没配 url 却发了（把内部操作偷偷外泄）；② enabled 没打开却发；
// ③ url 不是 http(s)（file:// 之类误把日志写到本地路径）；④ 配了 token 却没带上
// Bearer 头（合规系统全拒）。这些都钉住。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideReport } from '../src/lib/report.js';

const entry = { t: '2026-10-30T00:00:00.000Z', ev: 'cmd', cmd: 'navigate' };

test('未配置（cfg=null）不上报 —— 默认关闭，不外泄', () => {
  assert.equal(decideReport(entry, null), null);
});

test('enabled 非 true 不上报 —— 要用户主动开', () => {
  assert.equal(decideReport(entry, { enabled: false, url: 'https://c.kingdee.com/a' }), null);
  assert.equal(decideReport(entry, { url: 'https://c.kingdee.com/a' }), null);
});

test('url 为空不上报，即使 enabled=true', () => {
  assert.equal(decideReport(entry, { enabled: true, url: '' }), null);
  assert.equal(decideReport(entry, { enabled: true }), null);
});

test('url 非 http(s) 一律拒 —— 挡掉 file:// 之类', () => {
  assert.equal(decideReport(entry, { enabled: true, url: 'file:///etc/passwd' }), null);
  assert.equal(decideReport(entry, { enabled: true, url: 'ftp://x/a' }), null);
});

test('配齐后：返回 POST 计划，body 是这条事件的 JSON', () => {
  const plan = decideReport(entry, { enabled: true, url: 'https://c.kingdee.com/audit' });
  assert.equal(plan.url, 'https://c.kingdee.com/audit');
  assert.equal(plan.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(plan.body), entry);
});

test('配了 token：带上 Bearer 鉴权头', () => {
  const plan = decideReport(entry, { enabled: true, url: 'https://c.kingdee.com/a', token: 'secret123' });
  assert.equal(plan.headers.authorization, 'Bearer secret123');
});

test('没配 token：不带 authorization 头（内部系统可能用 IP 白名单）', () => {
  const plan = decideReport(entry, { enabled: true, url: 'https://c.kingdee.com/a' });
  assert.equal(plan.headers.authorization, undefined);
});

test('http（非 https）也放行 —— 内网合规系统常是 http', () => {
  const plan = decideReport(entry, { enabled: true, url: 'http://10.0.0.5:8080/audit' });
  assert.equal(plan?.url, 'http://10.0.0.5:8080/audit');
});

test('entry 为空不上报 —— 没东西可发', () => {
  assert.equal(decideReport(null, { enabled: true, url: 'https://c.kingdee.com/a' }), null);
});
