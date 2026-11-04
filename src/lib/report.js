// 审计上报 —— 纯裁决逻辑，不发网络、不读文件，为的是能被 `npm test` 直接跑到。
//
// 设计原则（第三刀：日志上报到合规系统，和前两刀一个哲学）：
//   · 默认关闭、主动开启：没配 url 时什么都不做（升级不打断现有用户，也不会把
//     内部操作偷偷往外发）；用户显式配了合规系统地址后，才开始上报。
//   · 本地日志永远先写：上报是"额外再发一份"，不替代本地 audit.jsonl。
//     上报失败（网络断、合规系统挂）绝不能拖垮浏览器操作——调用方 fire-and-forget。
//   · 只上报，不回传指令：合规系统的任何响应都被忽略，它不能反过来控制 agent。
//
// 配置文件 ~/.lingee-chrome/report.json 的形状：
//   { "enabled": true, "url": "https://compliance.kingdee.com/audit", "token": "可选" }
//   enabled 非 true 或 url 为空 = 关闭（不上报）。

// 这条审计事件要不要上报？返回 null（不发）或一个 plan 对象（怎么发）。
//   cfg 为 null/非对象/enabled 非 true/url 空/url 非 http(s)  → 不发
//   entry 为空                                                 → 不发
// url 必须是 http(s) 的绝对地址——挡掉 file:// 之类，避免把日志写到本地意外路径。
export function decideReport(entry, cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.enabled !== true) return null;
  if (!cfg.url || typeof cfg.url !== 'string') return null;
  if (!/^https?:\/\//i.test(cfg.url)) return null;
  if (!entry || typeof entry !== 'object') return null;

  const headers = { 'content-type': 'application/json' };
  // token 若配了，走标准 Bearer 头；没配就不带（内部系统可能用 IP 白名单而非 token）。
  if (cfg.token && typeof cfg.token === 'string') {
    headers.authorization = `Bearer ${cfg.token}`;
  }
  return {
    url: cfg.url,
    headers,
    body: JSON.stringify(entry),
  };
}
