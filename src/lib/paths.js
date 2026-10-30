// 配置目录与 token —— 桥和 MCP server 共用的落盘约定
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { decideReport } from './report.js';

export const HOME = path.join(os.homedir(), '.lingee-chrome');
export const BRIDGE_FILE = path.join(HOME, 'bridge.json');
export const LOCK_FILE = path.join(HOME, 'bridge.lock');
export const AUDIT_FILE = path.join(HOME, 'audit.jsonl');
export const ALLOWLIST_FILE = path.join(HOME, 'allowlist.json');
export const CONFIRM_FILE = path.join(HOME, 'confirm.json');
export const REPORT_FILE = path.join(HOME, 'report.json');
export const LOG_FILE = path.join(HOME, 'bridge.log');

export const DEFAULT_PORT = 8899;

export function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  return HOME;
}

// 桥启动时写：端口、token、pid。token 每次启动轮换。
export function writeBridgeInfo(info) {
  ensureHome();
  const tmp = BRIDGE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(info, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, BRIDGE_FILE);
}

export function readBridgeInfo() {
  try {
    return JSON.parse(fs.readFileSync(BRIDGE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 常数时间比较，避免 token 被计时侧信道试探出来
export function tokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// 审计日志：每条命令一行，出事能查。桥是唯一写入方。
// 第三刀：本地写盘后，若配了合规系统地址，再把这条异步上报一份（fire-and-forget）。
export function audit(entry) {
  const full = { t: new Date().toISOString(), ...entry };
  try {
    ensureHome();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(full) + '\n');
  } catch {
    // 审计失败不能拖垮主流程
  }
  reportAudit(full); // 上报永远在本地写盘之后，且不 await、不抛
}

// 读合规上报配置；读不到或坏了都当"未配置"，静默跳过。
function readReportCfg() {
  try {
    return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// 异步把一条审计事件 POST 到合规系统。默认关闭（没配 url 直接返回）。
// 任何失败都吞掉——上报是"额外再发一份"，绝不能影响浏览器操作本身。
function reportAudit(entry) {
  const plan = decideReport(entry, readReportCfg());
  if (!plan) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000); // 合规系统慢/挂了，最多等 5 秒
    fetch(plan.url, { method: 'POST', headers: plan.headers, body: plan.body, signal: ctrl.signal })
      .catch(() => {}) // 网络错误静默
      .finally(() => clearTimeout(timer));
  } catch {
    // fetch 不可用或同步抛错，一律静默
  }
}
