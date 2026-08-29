# 案例 14：加速乐 CDN — 双层 521 挑战与 Cookie 增量语义

> 📖 实战记录型案例。素材来自 `多探科技/pro20 加速乐 cdn 分析.md`（真实站点 allbrightlaw.com）。
> 加速乐是国内 CDN 防护服务商，521 挑战是它的经典防护。

## 背景

加速乐（Jiasule）CDN 对首次访问返回 **521** 状态码 + 一段 JS，
执行后生成 `__jsl_clearance_s` cookie，再次请求才放行。
本案例的站点用了**双层 521**——第一层下发 `__jsluid_s`，第二层才生成 clearance。

## 挑战流程（实战抓包记录）

```
1. 第一次 521: 啥都没带直接请求 → set-cookie: __jsluid_s
2. 响应里的 JS:
   document.cookie = '__jsl_clearance_s=1778038419.098|-1|QcfXYsuecRAGjLPLtijIZWncF6w%3D; ...'
   location.href = '/business/list_214_223_3.html'   ← 立即导航触发第二次 521
3. 第二次 521: 两个 cookie 都带上 → 校验通过，放行真实页面
```

## 关键发现（实战记录原文）

- **`document.cookie` 操作是增量的**——JS 设置 `__jsl_clearance_s` 不会导致
  `__jsluid_s` 丢失。补环境时 cookie setter 必须是「按 name 追加/更新」语义，
  整体覆盖会把第一层的 cookie 冲掉（本仓库 `test_e2e_ruishu.py` 里已修复的同类坑）
- 代码被混淆，实战中通过 **hook `Document.prototype.cookie` 的 setter** 观察 JS 写入了什么：
  ```js
  const nativeSetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').set;
  Object.defineProperty(document, 'cookie', {
    set: function(cookieStr) {
      console.log('Cookie 被修改:', cookieStr);
      // ...追溯调用栈
    }
  });
  ```

## 本工具集的应用

- 双层挑战 → `location.href` 赋值触发跳转：补环境的 Location 对象要支持
  `href` 写入并联动下一次请求（状态机式流程）
- Cookie 增量语义：`fp_env_patch.js` / 瑞数补丁的 cookie 实现直接复用
- Hook cookie setter 定位加密逻辑：与 js-reverse 手册「Hook 拦截」方法一致

## 状态

- [x] 实战抓包记录（双层 521 流程 + cookie hook 方法）
- [ ] 可运行代码（加速乐 JS 的执行环境）
