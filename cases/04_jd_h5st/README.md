# 案例 4：京东 h5st — 动态签名中的环境指纹

> 📖 文档型案例（基于公开资料整理）。h5st 是京东网页端核心反爬参数，
> 10 段分号分隔的动态签名，其中内置了环境指纹与请求上下文绑定。

## 背景

京东的搜索、商品详情、订单等核心接口由 **h5st（H5 Security Token）** 保护。
直接 Request + BeautifulSoup 请求会拿到异常响应——签名不合法。

## 反爬机制

h5st 是一个 10 段分号分隔的字符串，包含：时间戳、**fingerprint（环境指纹）**、
appId、token、key 哈希、版本号、环境 blob、最终签名等。

两个核心反逆向手段：

| 手段 | 说明 |
|------|------|
| **魔改哈希** | 算法初始常量/轮常量被篡改。用 `"abc"` 测试即可发现 SHA256/MD5 输出与标准值完全不同，`hashlib` 无法直接复现 |
| **字节码 VM** | part5/part9 的签名逻辑跑在自定义栈式虚拟机里（指令指针 + switch 分发），静态移植成本极高 |

key 公式（来自明文 `__genKey`）：

```
SHA256(token + fp + ts + appId + rd)
```

其中 `rd` 由服务端 `cactus.jd.com/request_algo` 下发（默认 `OqCq1v4AQSQJ`），
`fp` 即环境指纹——**环境不一致，签名就不同**。

## 指纹维度

- navigator（UA / platform / hardwareConcurrency）、screen、location
- document / Element / HTMLElement 原型链（bundle 会 patch 原型做检测）
- canvas.getContext 等 DOM API 桩
- 请求层 TLS 指纹（JA3）：headers/cookies 全对齐仍 403 时，通常是 TLS WAF 拦截

## 补环境要点（公开资料提炼的坑）

1. **不要覆盖 vm 上下文的内置 intrinsics**（Date/RegExp/Math/JSON）——
   否则遗留静态属性 `RegExp.$1` 跨 realm 读写不一致，导致时间戳替换失败（part1 出现字面量 `yyyy`）
2. 传给 sign 的 body 是魔改 SHA256(json) 的 64 位 hex，但 URL 上发送的是原始 JSON，且只做一次 encodeURIComponent
3. h5st 用 `encodeURI`（分号保留字面量），不是 encodeURIComponent
4. 最终架构参考：Python（curl_cffi）发包 → subprocess 调 Node 补环境签名器 → 回传 Python 直发请求

## 本工具集的应用

- `fp_env_patch.js` 提供 window/navigator/screen/document/canvas 原型链环境，
  可作为 h5st 补环境签名器的环境基座
- `test_fp.html` 采集真实浏览器报告 → `injectRealFingerprint` 注入，
  保证签名里的 fp 与真实浏览器一致
- 请求层同样走 curl_cffi 对齐 TLS 指纹

## 参考来源

- 京东联盟 h5st (5.3) 逆向实录 — https://pj-one.github.io/PJone/posts/jd_h5st%E8%A1%A5%E7%8E%AF%E5%A2%83%E6%B5%81%E7%A8%8B/
- 一次搞懂！JD h5st 参数逆向全过程 — https://blog.csdn.net/niaonao/article/details/158935925
- 京东 h5st 逆向补环境 2026 最新版 — https://blog.csdn.net/Chen__2024/article/details/159515583
- 京东 h5st 4.x 逆向算法分析 — https://zhuanlan.zhihu.com/p/683841431
- 某东签名算法 jsvmp 插桩法的纯算还原 — https://blog.zhx47.top/archives/1762148186443

## 状态

- [x] 机制文档
- [ ] 可运行代码（h5st 版本迭代频繁且各版差异大，建议按当前线上版本单独逆向）
