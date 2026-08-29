# 案例 8：TLS 指纹 — requests 拿不到、curl_cffi 能拿到的场景

> 📖 实战记录型案例。素材来自 `北大信研院` 目录下的真实爬虫项目（pro21、pro12-116 等）。
> 这是反爬的第一道门：**HTTP 层之上、浏览器指纹之前**。

## 背景

很多站点（尤其套 Cloudflare / Akamai 的）在 **TLS 握手阶段**就判定客户端类型。
请求还没到业务逻辑就被拒——headers、cookies 抄得再全也没用，因为问题不在 HTTP 头，而在
**TLS ClientHello 的特征**（加密套件顺序、扩展列表、椭圆曲线、ALPN 等，即 JA3/JA4 指纹）。

典型症状：

| 症状 | 含义 |
|------|------|
| 换 headers/cookies 无任何变化 | 不是 HTTP 层拦截 |
| 换 `curl_cffi` 立刻能拿到 | **TLS 指纹不匹配** |
| 空响应 / 连接被重置 | TLS 层直接拒绝 |

## 实战记录（北大信研院）

### 案例 A：tandfonline.com（Taylor & Francis，Cloudflare 防护）

项目：`pro21 科技文献 Cogent OA`，文档：`my_markdown/pro21 科技文献 Cogent OA 浏览器指纹.md`

**对照实验**（同一 URL、同一 headers/cookies）：

| # | 方式 | 结果 |
|---|------|------|
| 1 | `requests.get()` + 完整浏览器 headers + 完整 cookies | ❌ 403 |
| 2 | `curl_cffi.requests.get()` 不带 impersonate | ❌ 403 |
| 3 | `curl_cffi.requests.get(impersonate="chrome120")` | ✅ 200 / 403 不稳定 |

结论（原文）：「其实已经不需要了，curl_cffi 解决了，尽管他没有带那个 `cf_clearance` cookie，只是不稳定」。

后续记录：

- 该站有 Cloudflare 挑战（`main.js` + `__CF$cv$params` + `_cf_chl_opt`），做过完整 JS 逆向，
  但发现 curl_cffi 已经能绕过大部分拦截
- 高频全量采集后 **IP 被封**（该域名下都不行）——TLS 指纹只是第一层，行为/频控是第二层

### 案例 B：跨国药企官网批量采集

项目：`pro12-116个前沿资讯`（诺华 Novartis / 安斯泰来 Astellas / 罗氏 Roche /
百时美施贵宝 BMS / 强生 Johnson & Johnson / 艾伯维 AbbVie 等）

所有站点统一使用 curl_cffi handler + `impersonate="chrome110"` 抓列表页和文章页，
不带 impersonate 时部分站点直接拒绝服务。

### 公共库实现

`myutil/handleCurl_cffiSession.py`（北大信研院）封装了线程/异步两个 handler，
默认 `impersonate="chrome100"`，测试 URL 即为 tandfonline 文章页——
**说明 TLS 指纹问题在该项目中是常态，直接做进了基础设施**。

交接文档中的建议：请求类合并为一个大类，通过参数控制
「多线程 / 协程 / 普通 / **TLS 指纹（是否使用 curl_cffi）**」。

## 判断与排查流程

```
请求失败
  ├─ 换 curl_cffi 立刻可用? ──是──> TLS 指纹问题（本案例）
  ├─ curl_cffi 也 403? ──> 检查 impersonate 版本是否过旧
  ├─ 时好时坏? ──> 风控联动（cf_clearance 过期 / 频控 / 行为分）
  └─ 换 IP 才行? ──> IP 信誉问题（见案例 A 的结局）
```

## 本工具集的应用

TLS 指纹与浏览器指纹是**不同层**的对抗，互补使用：

- **TLS 层** → `curl_cffi` 的 `impersonate`（chrome100/110/120，按站点实测选择）
- **浏览器环境层** → 本仓库 `fp_env_patch.js` + `injectRealFingerprint`
- **验证层** → `test_e2e_ruishu.py` 的做法：curl_cffi 过 TLS + Node 补环境生成凭证

## 对比实验脚本

`demo_tls_compare.py`：对任意 URL 依次跑三种方式，输出状态码与响应长度对比：

```bash
pip install requests curl_cffi
python cases/08_tls_fingerprint/demo_tls_compare.py --url "https://目标站点"
# 可选: --impersonate chrome120
```

> ⚠️ 请注意目标站点服务条款，且不要高频重试——案例 A 的结局是整域名 IP 被封。

## 状态

- [x] 实战记录（来自北大信研院真实项目）
- [x] 可运行对比脚本 `demo_tls_compare.py`
- [ ] 针对新站点的完整采集脚本（按站点定制）
