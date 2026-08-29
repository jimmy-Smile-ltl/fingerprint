# fingerprint — Browser Fingerprint Collection & Node.js Environment Emulation

[![Node](https://img.shields.io/badge/Node-20.10+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-blue.svg)](README.md)

A toolkit that fully reproduces the six major browser fingerprint dimensions — **Canvas / WebGL / Audio / Fonts / Hardware / Timezone** —
covering the complete pipeline: *browser collection → Node.js environment patch → real data injection → parity verification*.

Collect your real device fingerprint in a browser with one click, then inject that report into the Node.js environment
so headless code emits a fingerprint identical to your real browser.

## Table of Contents

- [Features](#features)
- [Structure](#structure)
- [Quick Start](#quick-start)
- [Real-World Cases](#real-world-cases)
- [How It Works](#how-it-works)
- [Disclaimer](#disclaimer)
- [License](#license)

## Features

- **Six fingerprint dimensions** (`all_fp.js`): Canvas (basic + advanced), WebGL (hardware params + shader pixels),
  Audio, Fonts, Hardware, Timezone — works in both browser and Node.js
- **Visual collection page** (`test_fp.html`): open in browser → auto-collect → one-click copy/download of the report
- **Prototype-chain-level env patch** (`fp_env_patch.js`): `instanceof`, `toString` and getters all align with a real browser;
  follows the "real data first, synthetic fallback" principle
- **One-click report injection**: `injectRealFingerprint(report)` parses and injects every dimension automatically
- **Device presets / env vars**: `--preset macos-chrome` or `FP_GPU_VENDOR=...` for quick device-profile switching
- **Self-contained cases**: runnable real-world examples under `cases/`

## Structure

```
fingerprint/
├── all_fp.js                # Fingerprint collection functions (ES module, browser & Node)
├── fp_env_patch.js          # Node.js environment patch (Canvas/WebGL/Audio prototype chains + injection)
├── fp_env_ruishu_plus.js    # Enhanced Ruishu environment (research example, see Disclaimer)
├── test_fp.html             # Browser collection page (visual + one-click report copy)
├── test_fp_node.js          # Node.js smoke test (--preset to switch device profiles)
├── test_e2e_ruishu.py       # Ruishu WAF end-to-end research script (Python)
├── index.js                 # Legacy browser demo (depends on fingerprintjs2 CDN)
├── core/                    # Per-dimension standalone modules (canvasFP/webglFP/audioFP/netFP)
└── cases/                   # Real-world cases (one directory per case)
```

## Quick Start

### 1. Collect in a real browser

```bash
# Serve the directory
python -m http.server 8080
# Open http://localhost:8080/test_fp.html
# Wait for auto-collection → click "📥 Generate env JS" → "📋 Copy report JSON"
# Save it as browser_fingerprint.json (gitignored — do not commit)
```

### 2. Verify in Node.js

```bash
npm install            # only needs blueimp-md5
node test_fp_node.js   # full-dimension smoke test

# Switch device profile
node test_fp_node.js --preset macos-chrome
# Or via env vars
FP_GPU_VENDOR="NVIDIA" FP_GPU_RENDERER="RTX 4090" node test_fp_node.js
```

### 3. Inject the real report

```javascript
const { injectRealFingerprint } = require('./fp_env_patch.js');
const report = require('./browser_fingerprint.json');
injectRealFingerprint(report);          // auto-parses and injects every dimension

const mod = await import('./all_fp.js');
const fp = new mod.BrowserFingerprinter();
const result = await fp.getFingerprint();
// result.visitorId should match the browser-side report
```

> 💡 See `cases/01_parity_demo/` for a complete runnable example.

## Real-World Cases

See [`cases/`](cases/README.md) — one directory per case, each with its own README:

| # | Case | Type | Description |
|---|------|------|-------------|
| 1 | `cases/01_parity_demo` | 🔧 runnable | Report injection → browser/Node parity verification (self-contained) |
| 2 | `cases/02_ruishu_caict` | 🔧 runnable | Ruishu WAF end-to-end research flow (412 → env patch → cookie → verification) |
| 3 | `cases/03_akamai_bot_manager` | 📖 doc | Akamai sensor_data / _abck risk control + TLS fingerprinting |
| 4 | `cases/04_jd_h5st` | 📖 doc | JD.com h5st dynamic signature (patched hash + bytecode VM + env fingerprint) |
| 5 | `cases/05_boss_zhipin` | 📖 doc | BOSS Zhipin __zp_stoken__ dynamic token + Canvas fingerprint |
| 6 | `cases/06_device_sdk` | 📖 doc | Chinese risk-control device-fingerprint SDKs (Shumei / Dingxiang / GeeTest) |
| 7 | `cases/07_cloudflare` | 📖 doc | Cloudflare TLS fingerprinting + Turnstile invisible challenge |
| 8 | `cases/08_tls_fingerprint` | 🔧 runnable | TLS fingerprinting: requests fails, curl_cffi works (real projects + comparison script) |
| 9 | `cases/09_behavioral` | 📖 doc | Behavioral/trajectory fingerprints: GeeTest/Dingxiang slider "behavior as verification" |
| 10 | `cases/10_webrtc` | 📖 doc | WebRTC fingerprint: real-IP leak behind proxies (STUN/mDNS/IPv6) |
| 11 | `cases/11_automation_detection` | 📖 doc | Automation detection: webdriver flag, CDP exposure and stealth countermeasures |
| 12 | `cases/12_font` | 📖 doc | Font anti-crawl (glyph mapping) + font fingerprint (installed-font list) |
| 13 | `cases/13_aws_waf` | 📖 doc | AWS WAF Bot Control: 405 challenge + visual captcha |
| 14 | `cases/14_jiasule_521` | 📖 doc | Jiasule CDN 521: double challenge + incremental cookie semantics |
| 15 | `cases/15_douyin_a_bogus` | 📖 doc | Douyin a_bogus dynamic signature |
| 16 | `cases/16_xiaohongshu_xs` | 📖 doc | Xiaohongshu x-s/shield signature family |
| 17 | `cases/17_zhihu_x_zse_96` | 📖 doc | Zhihu x-zse-96 signature |
| 18 | `cases/18_netease_weapi` | 📖 doc | NetEase weapi two-stage request encryption |
| 19 | `cases/19_compliance` | 📖 compliance | Crawler legal precedents and boundaries |

## How It Works

### The six dimensions

| Dimension | Principle | Injection fields |
|-----------|-----------|------------------|
| Canvas | Font rendering / anti-aliasing / color-space differences across OSes → byte-level differences in `toDataURL` | `canvasDataURL` / `canvasDataURLAdvanced` |
| WebGL | GPU model, driver and shader floating-point precision differences | `webglVendorRaw` / `webglRendererRaw` / `webglShaderPixelsRaw` / `gpuMaxViewportDims` etc. |
| Audio | Audio-stack and float-precision differences → different waveform samples | `audioRawSamples` |
| Fonts | Installed-font set + rendering width differences | `fontWidthsRaw` (font name → width map) |
| Hardware | CPU cores / RAM / touch points / platform | `hardwareConcurrency` / `deviceMemory` / `platform` etc. |
| Timezone | IANA timezone + UTC offset + language list | `timezone` / `timezoneOffset` / `languages` |

### Environment-patch methodology (5 phases)

1. **Enumerate APIs** — statically search the target script for every browser API it touches
2. **Global skeleton** — `window = global` with prototype chains, wipe Node traces
3. **Patch per dimension** — "real data first, synthetic fallback" for every dimension
4. **toString camouflage** — hijack `Function.prototype.toString` to return `[native code]`
5. **Verify** — browser vs Node comparison, dimension by dimension (`test_fp_node.js`)

## Disclaimer

This project is intended **solely for studying and researching** browser fingerprinting techniques,
web security, and reverse engineering.

- Do not use it for any illegal purpose, unauthorized access, or crawling that violates a target site's ToS
- `test_e2e_ruishu.py` / `fp_env_ruishu_plus.js` demonstrate the generic challenge-response flow of the
  Ruishu WAF; the target site serves only as a public demonstration object — obey applicable laws
- Users are fully responsible for their own actions

## License

[MIT](LICENSE) © 2026 JimmySmile
