# 案例 15：抖音 a_bogus — 动态签名参数

> 📖 文档型案例（基于公开资料整理）。a_bogus 是抖音 Web 端请求的动态签名参数，
> 2024 年起改用**长 a_bogus**，逆向难度大幅上升。

## 背景

抖音 Web 端接口以 `a_bogus`（以及 `msToken` 等配套参数）做请求签名与身份校验。
搜索/评论/用户信息等接口缺失或签名错误都会被拒。

## 签名机制（公开资料共识）

| 要点 | 说明 |
|------|------|
| 动态性 | 参数值随请求内容与时间变化，一次性有效 |
| 保护形态 | 新版采用 VM 化/插桩混淆，纯静态阅读困难，公开方案多为「插桩分析 + 还原」或「补环境运行」 |
| 配套参数 | `msToken`（本地生成）与 `a_bogus` 配合；部分接口还需 cookie（ttwid 等） |
| 纯算 vs 补环境 | 有「纯算版」公开课程/工具，也有「补环境」路线——两条路线都有公开成功案例 |

## 逆向路线（公开资料总结）

1. **插桩路线**：在关键函数处插桩记录输入输出，还原算法（知乎「a_bogus 插桩算法分析以及还原」）
2. **补环境路线**：把签名 JS 搬进 Node 补环境执行，JS 不动、环境对齐即可
3. **跨平台通用思路**：a_bogus 类参数的通用逆向框架（定位 → 插桩/补环境 → 验证）

## 本工具集的应用

- **补环境路线直接受益**：`fp_env_patch.js` 提供 window/navigator/document/canvas 原型链，
  作为抖音签名 JS 的 Node 运行环境基座
- 签名 JS 对环境属性的读取（UA/平台/屏幕等）可通过 `setFingerprintConfig` 对齐真实浏览器
- 验证阶段配合 curl_cffi 对齐 TLS（见案例 8）

## 参考来源

- 抖音新版 a_bogus 插桩算法分析以及还原 — https://zhuanlan.zhihu.com/p/693331650
- 从抖音到小红书：多平台爬虫逆向中的 a_bogus 参数通用思路 — https://blog.csdn.net/weixin_28338005/article/details/158515246
- 【技术深水区】抖音 WEB 端逆向：从零到一拿下 a_bogus — https://blog.csdn.net/vitowwxz/article/details/159425014
- 抖音 a_bogus、mstoken 全参数爬虫逆向补环境 — https://www.cnblogs.com/dy9527/p/19057109
- 抖音 a_bogus 参数加密逆向 — https://daomanpy.com/spider/JS%E9%80%86%E5%90%91%E5%AE%9E%E6%88%98%E6%A1%88%E4%BE%8B/%E6%8A%96%E9%9F%B3a_bogus%E5%8F%82%E6%95%B0%E5%8A%A0%E5%AF%86%E9%80%86%E5%90%91

## 状态

- [x] 机制文档（含两条逆向路线）
- [ ] 可运行代码（签名 JS 需按当前线上版本单独逆向，不在仓库内置）
