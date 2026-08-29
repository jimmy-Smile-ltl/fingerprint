/**
 * test_fp_node.js — Node.js 环境指纹测试脚本
 *
 * 演示如何使用 fp_env_patch.js + all_fp.js 在 Node.js 中采集浏览器指纹。
 *
 * 用法:
 *   # 1. 安装依赖
 *   npm install blueimp-md5
 *
 *   # 2. 直接运行
 *   node test_fp_node.js
 *
 *   # 3. 使用环境变量自定义指纹
 *   FP_GPU_VENDOR="NVIDIA" FP_GPU_RENDERER="RTX 4090" node test_fp_node.js
 *
 *   # 4. 使用预设
 *   node test_fp_node.js --preset macos-chrome
 *   node test_fp_node.js --preset windows-chrome
 *   node test_fp_node.js --preset linux-chrome
 */

'use strict';

// ---- 解析命令行参数 ----
const args = process.argv.slice(2);
const presetIdx = args.indexOf('--preset');
const presetName = presetIdx >= 0 ? args[presetIdx + 1] : null;

// ---- 加载补环境 ----
const { setFingerprintConfig, applyPreset, FP_CONFIG } = require('./fp_env_patch.js');

// 应用预设（如果有）
if (presetName) {
  applyPreset(presetName);
}

// ---- 主函数 ----
(async function main() {
  console.log('═'.repeat(64));
  console.log('  🧬 Node.js Browser Fingerprint Test');
  console.log('═'.repeat(64));

  // 打印当前配置
  console.log('\n📋 Current Configuration:');
  console.log('  GPU Vendor:   ' + FP_CONFIG.gpuVendor);
  console.log('  GPU Renderer: ' + FP_CONFIG.gpuRenderer);
  console.log('  Platform:     ' + FP_CONFIG.platform);
  console.log('  CPU Cores:    ' + FP_CONFIG.hardwareConcurrency);
  console.log('  RAM (GB):     ' + FP_CONFIG.deviceMemory);
  console.log('  Timezone:     ' + FP_CONFIG.timezone);

  // 动态导入 ES module
  let mod;
  try {
    mod = await import('./all_fp.js');
  } catch (e) {
    console.error('\n❌ Failed to import all_fp.js:', e.message);
    console.log('\n💡 Please install dependencies first:');
    console.log('   npm install blueimp-md5\n');
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(64));
  console.log('  Running fingerprint tests...');
  console.log('─'.repeat(64));

  // ======================================================
  // 1. Canvas 指纹
  // ======================================================
  console.log('\n🎨 1. Canvas Fingerprint');
  try {
    const basic = mod.getCanvasFingerprint();
    console.log('  Basic Hash:     ' + basic.hash);
    console.log('  Raw (first 60): ' + basic.rawData.substring(0, 60) + '...');

    const adv = mod.getCanvasFingerprintAdvanced();
    console.log('  Advanced Hash:  ' + adv.hash);
    console.log('  Stable:         ' + (adv.isStable ? '✅ Yes' : '⚠️ Farbling'));
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 2. WebGL 指纹
  // ======================================================
  console.log('\n🖥️ 2. WebGL Fingerprint');
  try {
    const webglBasic = mod.getWebGLFingerprint();
    if (webglBasic) {
      webglBasic.split('|').forEach(item => {
        console.log('  ' + item.replace(/:/g, ': '));
      });
    } else {
      console.log('  ⚠️ WebGL not available');
    }

    const webglAdv = mod.getAdvancedWebGLFingerprint();
    console.log('  Shader Pixels:  ' + (webglAdv || 'N/A'));
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 3. Audio 指纹
  // ======================================================
  console.log('\n🔊 3. Audio Fingerprint');
  try {
    const startTime = Date.now();
    const audio = await mod.getAudioFingerprint(2000);
    const elapsed = Date.now() - startTime;
    console.log('  Hash:           ' + (audio.hash || '(empty)'));
    console.log('  Raw (first 80): ' + (audio.rawData ? audio.rawData.substring(0, 80) + '...' : audio.rawData));
    console.log('  Time:           ' + elapsed + 'ms');
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 4. 字体指纹
  // ======================================================
  console.log('\n🔤 4. Font Fingerprint');
  try {
    const fonts = mod.getFontFingerprint();
    const fontList = fonts ? fonts.split(',').filter(Boolean) : [];
    console.log('  Detected:       ' + (fontList.length > 0 ? fontList.join(', ') : '(none)'));
    console.log('  Count:          ' + fontList.length);
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 5. 硬件信息
  // ======================================================
  console.log('\n💻 5. Hardware Profile');
  try {
    const hw = mod.getHardwareFingerprint();
    Object.entries(hw).forEach(([k, v]) => {
      console.log('  ' + k + ': '.padEnd(22 - k.length) + v);
    });
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 6. 时区 & 语言
  // ======================================================
  console.log('\n🌍 6. Timezone & Locale');
  try {
    const tz = mod.getTimezoneFingerprint();
    Object.entries(tz).forEach(([k, v]) => {
      const val = Array.isArray(v) ? v.join(', ') : v;
      console.log('  ' + k + ': '.padEnd(22 - k.length) + val);
    });
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 7. 反指纹检测
  // ======================================================
  console.log('\n🛡️ 7. Anti-Fingerprinting Detection');
  try {
    console.log('  Canvas Farbling:    ' + (mod.detectCanvasFarbling() ? '⚠️ Enabled' : '✅ Not detected'));

    const wi = mod.detectWebGLInterception();
    if (wi.webglAvailable) {
      console.log('  WebGL:              ✅ Available');
      console.log('  Debug Info Blocked: ' + (wi.debugInfoBlocked ? '⚠️ Yes' : '✅ No'));
      console.log('  Real GPU Vendor:    ' + (wi.unmaskedVendor || '(blocked)'));
      console.log('  Real GPU Renderer:  ' + (wi.unmaskedRenderer || '(blocked)'));
    } else {
      console.log('  WebGL:              ❌ Not available');
    }

    const ua = mod.detectUAReduction();
    console.log('  UA Reduction:       ' + (ua.isReduced ? '⚠️ Enabled' : '✅ Full UA'));
    console.log('  Chrome Version:     ' + ua.chromeVersion);
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  // ======================================================
  // 8. 综合指纹
  // ======================================================
  console.log('\n🧬 8. Comprehensive Fingerprint');
  try {
    const fp = new mod.BrowserFingerprinter();
    const startTime = Date.now();
    const result = await fp.getFingerprint();
    const elapsed = Date.now() - startTime;

    console.log('  Visitor ID:  ' + result.visitorId);
    console.log('  Components:  ' + Object.keys(result.components).length);
    console.log('  Time:        ' + elapsed + 'ms');
  } catch (e) {
    console.error('  ❌ Error:', e.message);
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  ✅ All tests completed');
  console.log('═'.repeat(64));
  console.log('\n💡 Tips:');
  console.log('  - Use --preset <name> to switch device profile');
  console.log('  - Available presets: windows-chrome, macos-chrome, linux-chrome, ios-safari');
  console.log('  - Or set env vars: FP_GPU_VENDOR, FP_GPU_RENDERER, FP_PLATFORM, etc.');
  console.log('  - Use setFingerprintConfig() in code for full customization\n');

})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
