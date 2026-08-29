# 案例 5：BOSS 直聘 — __zp_stoken__ 动态令牌 + Canvas 指纹

> 📖 文档型案例（基于公开资料整理）。BOSS 直聘的反爬是"动态令牌 + 指纹 + 行为 + 反调试"的组合拳。

## 背景

BOSS 直聘对核心接口做了多层防护。公开资料描述的典型现象：

- 随便请求接口返回 `{"code": 37, "message": "请求异常"}`
- 打开开发者工具触发无限循环 / 页面反调试
- 关键 Cookie `__zp_stoken__` 缺失或过期时所有接口不可用

## 反爬机制

| 层 | 说明 |
|----|------|
| `__zp_stoken__` | 核心身份校验 Cookie，动态生成、强时效性、与请求上下文绑定 |
| Canvas 指纹 | JS 采集 canvas 渲染结果作为环境指纹的一部分 |
| 行为检测 | 鼠标轨迹、页面停留等行为特征 |
| 反调试 | 开发者工具打开触发无限 debugger / 循环 |
| 代码混淆 | OB 混淆 + 字符串加密，需要 AST 插桩解混淆 |

## 指纹维度

- **Canvas**：`canvas.toDataURL` 渲染差异（不同系统字体渲染/抗锯齿不同）
- 时区 / 语言 / 屏幕 / UA 等 navigator 项
- 环境一致性：token 生成依赖的浏览器环境与请求环境不一致会被风控拒绝

## 本工具集的应用

1. **Canvas 指纹采集**：`test_fp.html` 在真实浏览器采集 `rawData`，
   比对手工补环境方案的输出是否一致
2. **补环境基座**：`fp_env_patch.js` 提供 canvas/navigator/document 原型链，
   支撑 `__zp_stoken__` 生成脚本在 Node 中运行
3. **一致性校验**：`injectRealFingerprint` 注入真实报告后，
   用 `all_fp.js` 重算 visitorId 验证环境对齐程度（流程同 `cases/01_parity_demo`）

## 参考来源

- 逆向解析 BOSS 直聘 __zp_stoken__：从数据抓取到清洗 — https://blog.csdn.net/weixin_29065015/article/details/159028072
- Boss 直聘 __zp_stoken__ 完整逆向分析 — https://juejin.cn/post/7667176850519130148
- BOSS 直聘爬虫实战：如何绕过 __zp_stoken__ 反爬机制 — https://blog.csdn.net/weixin_29044157/article/details/158682195
- boss 直聘 __zp_stoken__ 逆向分析 — https://blog.51cto.com/u_15835408/14541256
- 逆向破解 boss 直聘 __zp_stoken__ 参数的 JS 混淆与 AST 插桩 — https://developer.aliyun.com/article/1328914

## 状态

- [x] 机制文档
- [ ] 可运行代码（token 生成逻辑版本迭代频繁，需按当前线上版本单独逆向）
