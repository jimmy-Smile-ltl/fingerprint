# 案例 11：自动化检测 — webdriver 标记、CDP 暴露与 stealth 对抗

> 📖 文档型案例（基于公开资料整理）。Playwright/Selenium 被检测的四大原因：
> `navigator.webdriver` 标记、CDP 协议暴露、指纹差异、权限行为。

## 背景

网站检测自动化工具通常有四层逻辑（公开资料共识）：

| 层 | 检测项 | 说明 |
|----|--------|------|
| 1. 显式标记 | `navigator.webdriver === true` | 自动化驱动启动的浏览器带该标记 |
| 2. 协议暴露 | CDP（Chrome DevTools Protocol）探测 | 通过 `Runtime.enable` / `Target.getTargets` 等探测外部调试连接 |
| 3. 指纹差异 | WebGL 厂商、Canvas 噪声、headless UA | 无头模式与正常浏览器的指纹不一致 |
| 4. 权限行为 | permissions query、弹窗行为 | 自动化环境的默认权限响应与真实用户不同 |

## stealth 方案（公开资料常见做法）

- **playwright-stealth 类补丁**：注入 init script，重写 `navigator.webdriver`、`languages`、
  `plugins`、`chrome.runtime` 等属性
- **CDP 隐藏**：限制调试端口暴露、避免特征性 `--enable-automation` 启动参数
- **指纹对齐**：WebGL/Canvas 与目标浏览器版本一致（本仓库的强项）
- **行为模拟**：随机化操作节奏、真实鼠标轨迹（见案例 9）

## 本工具集的应用

`fp_env_patch.js` 里已经有这套对抗的 Node 侧对应物：

| 环境侧实现 | 对应浏览器侧检测 |
|-----------|-----------------|
| `get webdriver() { return false; }` | 第 1 层：显式标记 |
| `navigator.plugins/mimeTypes` 空插件数组 + 原型链 | 第 3 层：指纹差异 |
| `detectCanvasFarbling()` / `detectWebGLInterception()` / `detectUAReduction()` | 自检工具：评估目标页是否在测这些维度 |

浏览器自动化的场景：先用 `test_fp.html` 对比「真实浏览器 vs 自动化浏览器」的
输出差异，逐项决定 stealth 补丁要修什么——而不是无脑全量打补丁。

## 参考来源

- WebDriver 检测对抗：如何让你的 Playwright 真正隐身 — https://blog.csdn.net/weixin_41943766/article/details/161696594
- 实战：利用 Playwright 隐藏自动化特征（Stealth 模式）的底层原理 — https://cloud.tencent.com/developer/article/2700641
- Playwright Stealth 实战：绕过自动化检测的浏览器指纹 — https://blog.csdn.net/weixin_28595749/article/details/162504741
- playwright-stealth 开源项目 — https://github.com/shuangying0001-beep/playwright-stealth
- 基于 Playwright 的爬虫架构：浏览器指纹伪装与反检测 — https://raybyte.cn/post/2026/8/6/6abb7474
- Playwright 进阶：反检测与性能优化 — https://nanmicoder.github.io/CrawlerTutorial/%E7%88%AC%E8%99%AB%E8%BF%9B%E4%BB%B7/05_Playwright%E8%BF%9B%E9%98%B6_%E5%8F%8D%E6%A3%80%E6%B5%8B%E4%B8%8E%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96.html

## 状态

- [x] 机制文档
- [ ] 可运行代码（stealth init script 可按目标站点定制）
