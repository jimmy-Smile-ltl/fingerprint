# 案例 6：国内风控设备指纹 SDK（数美 / 顶象 / 极验设备验）

> 💡 一句话理解：风控 SDK 用几百个「弱特征」组合出设备唯一 ID——看清它的采集面，才知道要补什么环境。

> 📖 文档型案例（基于公开资料整理）。看雪上有对某大厂风控 SDK 的完整分析：
> 解密混淆字符串 → hook 加密前函数 → protobuf 反序列化，共得到 **约 350 条上传字段**。

## 背景

国内主流风控厂商（数美、顶象、极验「设备验」、同盾等）都提供设备指纹 SDK，
部署在电商、社交、游戏、招聘等场景，作为"设备唯一标识 + 风险评分"的数据源。
Web 端与 App 端采集面不同，但思路一致：**弱特征因子组合出强唯一性**。

## 采集面（公开资料整理）

### Web 端（与本工具集直接对应）

- Canvas / WebGL（GPU 型号、渲染差异）/ Audio
- 字体列表 / 时区 / 语言 / 屏幕 / UA / 硬件（核心数、内存）
- 浏览器特性检测（如 WebDriver、插件列表）

### App 端（看雪对某大厂 SDK 的分析）

| 类别 | 检测项举例 |
|------|-----------|
| 硬件 | IMEI / Android ID、CPU 核心数与频率、RAM、屏幕亮度/尺寸、电池电压/温度/充电状态 |
| GPU | `GL_VENDOR` / `GL_RENDERER` |
| 存储 | 内部存储序列号、SD 卡 CID、`/sys/block/.../serial` |
| 文件系统 | 对 `/data/system`、`/vendor/firmware` 等目录按修改时间排序后对 inode 等计算哈希 |
| 网络 | 局域网 IP、MAC、子网掩码、DNS 列表 |
| 应用环境 | 安装列表（如"微信的随机路径"被视为核心唯一指纹）、输入法列表 |
| 对抗检测 | Frida（`linjector`、`re.frida.server`）、Xposed（`XposedBridge`）、libc.so 段 CRC 校验 |

## 关键设计思想

- **弱特征组合**：单看每一项都不唯一，组合哈希后接近唯一
- **环境一致性校验**：SDK 上报的环境与请求侧环境不一致即触发风险分
- **对抗检测内嵌**：指纹 SDK 同时是反调试/反 hook 检测器

## 本工具集的应用

本仓库的六维度（Canvas/WebGL/Audio/字体/硬件/时区）就是 Web 端 SDK 采集面的
标准子集——可以这样用：

1. **对照理解**：用 `test_fp.html` 在真实浏览器跑一遍，观察每家 SDK 会收集哪些维度
2. **环境模拟**：`fp_env_patch.js` 的 `PRESETS` / `setFingerprintConfig` 可快速构造
   「windows-chrome / macos-chrome / linux-chrome / ios-safari」等设备画像，
   验证目标接口在不同画像下的风控表现
3. **一致性验证**：`detectCanvasFarbling` / `detectWebGLInterception` / `detectUAReduction`
   三个检测函数可用于评估目标页面是否有指纹混淆/拦截

## 参考来源

- [原创]某大厂风控引擎 SDK 设备指纹和环境检测分析 — https://bbs.kanxue.com/thread-280869.htm
- 数美科技设备指纹产品 — https://www.ishumei.com/product/bs-post-sdk.html
- 顶象设备指纹 UNIFYID — https://www.dingxiang-inc.com/business/fingerprint
- GeeTest 设备验产品概述 — https://docs.geetest.com/guard/introduce/overview/
- 2026 年 7 大主流设备指纹方案评测 — https://www.sohu.com/a/976339191_122027489

## 状态

- [x] 机制文档
- [ ] 可运行代码（各家 SDK 私有且混淆，采集面仅供参考）
