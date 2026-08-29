# 案例 17：知乎 x-zse-96 — Webpack 打包里的签名

> 📖 文档型案例（基于公开资料整理）。知乎是「入门级」签名逆向的经典目标：
> 防护只有签名参数 + cookie 校验，适合练手完整链路。

## 背景

知乎接口要求请求头携带 `x-zse-96` 签名。公开资料测试结论：
**只需要 cookie（如 `d_c0`）和 `x-zse-96` 就能过接口**——没有 WAF 层，
是学习「定位 → 分析 → 复现」的最小闭环。

## 签名机制

| 要点 | 说明 |
|------|------|
| 代码位置 | Webpack 打包产物中，需解析加载器定位目标函数 |
| 算法结构 | 对 URL+参数拼接做固定变换 + 哈希，版本号 96 即签名方案版本（此前还有 x-zse-93 等历史版本） |
| 调试方法 | 全局搜索 `x-zse-96` 打断点；或按请求参数（如 offset）打 XHR 断点 |
| 复现路线 | ① Python 纯算（execjs / 手动移植）② Node.js + JSDOM/补环境运行原文 JS |

## 逆向流程（公开资料共识）

1. 全局搜索参数名 → 定位到设置请求头的位置
2. 断点调试 → 拿到签名函数及其依赖
3. 两条路线二选一：纯算移植 / 补环境运行
4. 验证：Python 请求带签名 → 200

## 本工具集的应用

- 知乎场景不需要重型补环境，但**方法同源**：本仓库的「浏览器采集 → 补环境 → 注入」
  流程适用于任何需要环境对齐的签名 JS
- JSDOM/Node 补环境路线可参考 `fp_env_patch.js` 的骨架（window/document 原型链）

## 参考来源

- Python 爬虫逆向知乎 x-zse-96 加密参数：从 JS 定位到 execjs — https://devpress.csdn.net/v1/article/detail/102203890
- 逆向知乎 x-zse-96 签名：从 JS 断点到 Python 实现 — https://blog.csdn.net/HJ921004/article/details/101369403
- 知乎 x-zse-96 参数逆向分析（Webpack 加载器解析）— https://github.com/yelantingxue0808/zhihu-x-zse-96-reverse
- 某乎 x-zse-96（补环境详解）— https://zhuanlan.zhihu.com/p/638375048
- 手把手教你用 Node.js + JSDOM 搞定知乎 x-zse-96 — https://wenku.csdn.net/column/3w7g4jgpi3j

## 状态

- [x] 机制文档（完整逆向流程 + 两条复现路线）
- [ ] 可运行代码（可作为练手案例自行实现，仓库不内置）
