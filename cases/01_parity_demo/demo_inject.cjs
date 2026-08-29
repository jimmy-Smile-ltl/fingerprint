/**
 * 案例 1: 报告注入 → Node 输出与浏览器一致性验证
 *
 * 用法（仓库根目录）:
 *   npm install
 *   node cases/01_parity_demo/demo_inject.cjs
 */
'use strict';

(async () => {
  const { injectRealFingerprint } = require('../../fp_env_patch.js');
  const report = require('./sample_report.json');

  console.log('═'.repeat(64));
  console.log('  案例 1: 浏览器采集报告 → Node.js 注入 → 一致性验证');
  console.log('═'.repeat(64));

  // 一键注入报告中所有可注入维度（Canvas/WebGL/Audio/硬件/时区）
  injectRealFingerprint(report);

  const mod = await import('../../all_fp.js');
  const fp = new mod.BrowserFingerprinter();
  const result = await fp.getFingerprint();

  const expected = report.visitorId;
  const actual = result.visitorId;
  console.log('\n  报告中的 visitorId: ' + expected);
  console.log('  注入后 Node 输出:   ' + actual);

  if (expected === actual) {
    console.log('\n  ✅ 一致! 注入生效 — Node 输出与报告完全相同');
  } else {
    console.log('\n  ❌ 不一致 — 检查注入通道或报告格式');
    process.exitCode = 1;
  }
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
