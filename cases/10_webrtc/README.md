# 案例 10：WebRTC 指纹 — 代理下的真实 IP 泄露

> 📖 文档型案例（基于公开资料整理）。指纹浏览器圈有句话：
> 「WebRTC 这个设置不关，等于指纹环境白用」。

## 背景

WebRTC 为网页提供音视频通信能力，但它的 NAT 穿透机制会**绕过代理**暴露真实网络信息。
对爬虫场景而言：代理配得再干净，一个 WebRTC 检测就把真实出口 IP 卖给了风控。

## 泄露通道

| 通道 | 说明 |
|------|------|
| STUN 反射 | 向 STUN 服务器发起探测，服务器回显客户端真实公网 IP |
| mDNS 混淆 | 本地候选用 `xxx.local` 域名掩码——浏览器若把 `.local` 解析成真实局域网 IP 就泄露内网 |
| IPv6 | 代理只转 IPv4 时，IPv6 候选直接暴露真实地址 |

## 检测方式

- 页面创建 `RTCPeerConnection` → `createDataChannel` → `createOffer` → 解析 SDP 中的候选地址
- 第三方检测平台（如 BrowserScan）会将 WebRTC IP 与请求 IP、DNS 出口 IP 交叉比对，
  不一致即判定为代理/指纹环境

## 对抗策略

1. **完全禁用**：关闭 WebRTC（最简单，但部分站点会检测「不支持 WebRTC」本身作为特征）
2. **替换公网 IP**：让 SDP 里的公网候选等于代理出口 IP（与请求来源一致）
3. **仅保留 mDNS**：只留 `.local` 候选，不暴露公网/内网
4. **源码级**：修改 Chromium 网络层（指纹浏览器方案，最彻底）

## 本工具集的应用

`fp_env_patch.js` 目前**未覆盖 WebRTC 维度**——`RTCPeerConnection` 不在补环境清单里。
两个实际应用点：

1. **Node 补环境扩展**：如目标脚本调用 `RTCPeerConnection`，需补 `createOffer`/`setLocalDescription`
   并返回与代理出口一致的候选（可参考本文件 `fp_env_patch.js` 的 Audio/WebGL 补法）
2. **自检**：真实浏览器里用 `test_fp.html` 的思路加一段 WebRTC 探测，
   确认代理环境下没有意外泄露

## 参考来源

- 【网络与爬虫】WebRTC 指纹伪造：绕过实时通信协议反爬 — https://blog.csdn.net/maoyu_dual/article/details/149859220
- WebRTC 泄露真实 IP？指纹浏览器这个设置不关等于白用 — https://www.todetect.cn/article/fingerprint-browser/webrtc-leak-device/
- 指纹浏览器 WebRTC 怎么禁：真实 IP 泄漏封堵 — https://www.qhbrowser.com/blog/webrtc-leak-blocking-guide
- 从 BrowserScan 的检测逻辑出发，逆向分析并彻底修复 WebRTC 泄露 — https://wenku.csdn.net/column/dpjnp20p87a
- WebRTC 为什么会泄露真实 IP？原理、风险与解决思路 — https://www.todetect.cn/article/webrtc/webrtc-security/

## 状态

- [x] 机制文档
- [ ] 可运行代码（RTCPeerConnection 补环境 + WebRTC 自检页面）
