# 案例 3：Akamai Bot Manager — sensor_data 与 _abck 风控

> 💡 一句话理解：Akamai 的难点不在加密，在于把浏览器环境压缩成 sensor_data 交给风控评分——环境不一致必被拒。

> 📖 文档型案例（基于公开资料整理）。Akamai 是爬虫界公认的"硬骨头"，难点不在 JS 加密本身，而在风控维度。

## 背景

Akamai 是全球领先的边缘计算与网络安全服务商，其 **Bot Manager** 部署在大量航司、银行、
物流与电商站点上（公开资料中常见案例：韩亚航空、DHL、多个物流平台）。

典型现象：首次请求返回 `_abck` cookie 挑战，JS 收集环境信息生成 `sensor_data` 参数提交，
服务端校验通过后下发有效的 `_abck`，后续请求携带它才能拿到数据。

## 反爬机制

| 层 | 说明 |
|----|------|
| `_abck` cookie | 服务端下发的挑战 cookie，值是校验状态机，需与 sensor_data 联动刷新 |
| `sensor_data` | 浏览器端 JS 收集的**环境指纹 + 行为数据**，经过压缩/编码后 POST 提交 |
| TLS 指纹 | 请求层用 JA3 校验 TLS ClientHello 特征，Requests 默认发包极易被识别，需 `curl_cffi` 等模拟 Chrome 指纹 |
| 风控联动 | 即使 JS 逆向正确，环境不一致仍会被判 Bot——难点在风控，不在加密 |

## 指纹维度（sensor_data 收集的内容）

sensor_data 本质是"浏览器环境的压缩快照"，与本工具集维度高度重合：

- **Canvas / WebGL / Audio**：渲染差异与硬件差异
- **时区 / 语言 / 屏幕 / 硬件**：navigator、screen 各项
- **事件行为**：鼠标移动、点击等行为数据（补环境方案无法伪造的部分）

## 本工具集的应用

1. **理解采集面**：用 `test_fp.html` 在真实浏览器里观察一次完整采集，对照 Akamai 的收集项
2. **环境对齐**：`fp_env_patch.js` + `injectRealFingerprint(report)` 让 Node 环境输出与真实浏览器一致，
   降低"环境指纹不一致"这一最容易被风控抓住的点
3. **TLS 层**：请求用 `curl_cffi`（`impersonate="chrome110"`），与浏览器 TLS 指纹对齐
   （本仓库 `test_e2e_ruishu.py` 的验证阶段就是同一套做法）

## 参考来源

- 爬虫逆向学习 (十五)：Akamai 3.0 反爬分析与 sensor_data — https://blog.csdn.net/weixin_43845191/article/details/144977354
- Akamai2.0 反爬虫系统 sensor_data 参数及 akamai-bm — https://www.cnblogs.com/xiaoweigege/p/17455532.html
- akamai2.0-sensor_data 开源解析 — https://github.com/xiaoweigege/akamai2.0-sensor_data/blob/main/README-ZH.md
- Akamai 对抗的隐秘战线——TLS 指纹 — https://www.yuanrenxue.cn/tricks/akamaidk.html
- Akamai _abck 逆向解析与 sensor_data 生成机制研究 — https://wenku.csdn.net/doc/unad24968t
- 逆向工程实战：AKM 3.0 风控 sensor_data 生成与 _abck 令牌 — http://www.mhpn.cn/news/1487446

## 状态

- [x] 机制文档
- [ ] 可运行代码（本仓库暂未内置 Akamai 专用脚本；sensor_data 的生成逻辑各家版本差异大，需按目标站点单独逆向）
