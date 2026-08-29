# 实际案例

每个案例一个目录，自带 README 和可运行脚本。新案例请按下方模板组织。

## 案例列表

| # | 目录 | 主题 | 类型 | 状态 |
|---|------|------|------|------|
| 1 | [`01_parity_demo`](01_parity_demo/) | 报告注入 → Node 输出与浏览器一致性验证 | 🔧 可运行 | ✅ 自包含 |
| 2 | [`02_ruishu_caict`](02_ruishu_caict/) | 瑞数 WAF 端到端研究流程（412 → cookie） | 🔧 可运行 | 🚧 待补真实结果 |
| 3 | [`03_akamai_bot_manager`](03_akamai_bot_manager/) | Akamai sensor_data / _abck 风控 + TLS 指纹 | 📖 文档 | ✅ 来源已标注 |
| 4 | [`04_jd_h5st`](04_jd_h5st/) | 京东 h5st 动态签名（魔改哈希 + 字节码 VM + 环境指纹） | 📖 文档 | ✅ 来源已标注 |
| 5 | [`05_boss_zhipin`](05_boss_zhipin/) | BOSS 直聘 __zp_stoken__ 动态令牌 + Canvas 指纹 | 📖 文档 | ✅ 来源已标注 |
| 6 | [`06_device_sdk`](06_device_sdk/) | 国内风控设备指纹 SDK 采集面（数美/顶象/极验） | 📖 文档 | ✅ 来源已标注 |
| 7 | [`07_cloudflare`](07_cloudflare/) | Cloudflare TLS 指纹 + Turnstile 隐形验证 | 📖 文档 | ✅ 来源已标注 |
| 8 | [`08_tls_fingerprint`](08_tls_fingerprint/) | TLS 指纹：requests 拿不到、curl_cffi 能拿到（北大信研院实战） | 🔧 可运行 | ✅ 实战记录 |
| 9 | [`09_behavioral`](09_behavioral/) | 行为/轨迹指纹：极验/顶象滑块轨迹「行为即验证」 | 📖 文档 | ✅ 来源已标注 |
| 10 | [`10_webrtc`](10_webrtc/) | WebRTC 指纹：代理下真实 IP 泄露（STUN/mDNS/IPv6） | 📖 文档 | ✅ 来源已标注 |
| 11 | [`11_automation_detection`](11_automation_detection/) | 自动化检测：webdriver 标记、CDP 暴露与 stealth 对抗 | 📖 文档 | ✅ 来源已标注 |
| 12 | [`12_font`](12_font/) | 字体反爬（字形映射）+ 字体指纹（安装列表） | 📖 文档 | ✅ 来源已标注 |

> 📖 文档型 = 基于公开资料整理的机制分析与方法论文档，不含可运行代码；
> 🔧 可运行 = 自带脚本，可直接执行。

## 指纹类型覆盖矩阵

| 指纹类型 | 案例 | 覆盖度 |
|---------|------|--------|
| Canvas | 01 / 03 / 05 / 06 / 07 / 11 | ✅ 高 |
| WebGL | 03 / 06 / 07 / 11 | ✅ 高 |
| Audio | 01 / 06 | ✅ 中 |
| 硬件 / Navigator | 01 / 06 | ✅ 中 |
| 时区 / 语言 | 01 / 06 | ✅ 中 |
| 字体指纹 | 12 | ✅ 中（工具集已实现 `getFontFingerprint`） |
| TLS (JA3/JA4) / HTTP/2 | 03 / 07 / 08 | ✅ 高（08 实战 + 对比脚本） |
| 行为 / 轨迹 | 09 | ✅ 中（机制 + 生成策略） |
| WebRTC | 10 | ✅ 中（泄露通道 + 对抗策略） |
| 自动化检测 (webdriver/CDP) | 11 | ✅ 中（四层检测 + stealth） |
| 设备指纹 SDK 全景 | 06 | ✅ 高（350 字段采集面） |
| 持久化追踪 (evercookie 类) | — | ⬜ 未覆盖（业界已边缘化） |

覆盖结论：**主流指纹类型已全部覆盖**。剩余未覆盖的（evercookie 类持久化追踪、
CSS 媒体查询指纹等）在 2026 年的反爬实践中已边缘化，优先级低。

## 案例编写模板

```
cases/NN_案例名/
├── README.md              # 必填：目标介绍、环境指纹诉求、步骤、结果、踩坑记录
├── 采集/或运行脚本         # 可运行代码（Python / Node）
├── sample_report.json     # 可选：示例指纹报告（脱敏后）
└── screenshots/           # 可选：截图
```

README 建议包含以下小节：

```markdown
# 案例 NN：标题

## 背景
目标站点 / 反爬机制 / 需要什么指纹维度

## 流程
1. ...
2. ...

## 运行（可运行案例）
命令 + 依赖

## 本工具集的应用（文档案例）
这个案例与 all_fp.js / fp_env_patch.js / test_fp.html 的关系

## 结果
关键输出、通过/失败状态、遗留问题

## 踩坑
遇到的问题与解法（环境差异、注入字段、旋转参数等）

## 参考来源
文档型案例必须附来源 URL 列表
```

## 补充真实案例后

补充完成后确认：

- [ ] 案例 README 写清运行依赖与目标
- [ ] 无硬编码的站点专属凭证/采集值（旋转参数一律动态提取或占位符）
- [ ] 无真实浏览器指纹报告被提交（`browser_fingerprint.json` 已在 .gitignore）
