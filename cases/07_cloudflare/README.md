# 案例 7：Cloudflare — TLS 指纹与 Turnstile 隐形验证

> 📖 文档型案例（基于公开资料整理）。Cloudflare 是爬虫日常打交道最多的 403 来源，
> 它的防线是多层的：TLS 指纹 → HTTP 特征 → 浏览器指纹 → 行为验证（Turnstile）。

## 背景

Cloudflare 的 WAF 保护着海量网站。典型现象：

- 直接请求返回 403，或弹 Turnstile「隐形验证」
- 单纯修改请求头完全无法规避——被 TLS 指纹（JA3）识别
- 通过挑战后获取 `cf_clearance` cookie，后续请求才能放行

## 反爬机制

| 层 | 说明 |
|----|------|
| **TLS 指纹（JA3/JA4）** | 检查 ClientHello 的加密套件、扩展顺序等特征，Requests 默认发包与浏览器差异明显 |
| HTTP 特征 | Header 顺序、HTTP/2 指纹等 |
| 浏览器指纹 | Canvas/WebGL/Audio 等环境检测，配合 **Farbling 检测**（每次 toDataURL 结果不同 = 注入噪声） |
| 行为验证 | Turnstile：无感挑战，后台根据环境 + 行为打分，可疑才弹可见验证 |

## 对抗思路（公开资料共识）

1. **TLS 层**：`curl_cffi`（`impersonate="chrome110"` 等）或 playwright-stealth
2. **浏览器层**：真实浏览器自动化时打 stealth 补丁（webdriver 痕迹、指纹噪声）
3. **Cookie 层**：`cf_clearance` 时效内复用，避免重复挑战

## 本工具集的应用

`all_fp.js` 内置的三个检测函数恰好覆盖 Cloudflare 的指纹对抗面：

| 检测函数 | 对应 Cloudflare 手段 |
|----------|---------------------|
| `detectCanvasFarbling()` | 检测 Canvas 是否被注入噪声（Brave 类浏览器 / 反指纹扩展） |
| `detectWebGLInterception()` | 检测 GPU 信息是否被拦截/伪造 |
| `detectUAReduction()` | 检测 UA 是否被缩减（UA Reduction） |

实战用法：对目标页面先跑一次 `test_fp.html` 的采集 + 这三项检测，
判断页面依赖哪些指纹维度，再决定补环境注入哪些字段（`injectRealFingerprint`）。

## 参考来源

- Cloudflare TLS 指纹识别反爬终极对抗方案 — https://juejin.cn/post/7627205392046260270
- Cloudflare 反爬机制全面解析：从原理到绕过方案 — https://segmentfault.com/a/1190000047764557
- 绕不过的 Cloudflare Turnstile？playwright-stealth 实战 — https://blog.csdn.net/weixin_41943766/article/details/155271345
- Turnstile 验证绕过 — 处理 Cloudflare 机器人检测 — https://bosh.zz.ac/posts/107189741.html
- 2025 年如何绕过 Cloudflare 反爬虫挑战（Capsolver）— https://www.capsolver.com/zh/blog/All/bypass-cloudflare-challenge-2025

## 状态

- [x] 机制文档
- [ ] 可运行代码（绕过依赖真实浏览器/代理与动态挑战，不在本仓库范围内）
