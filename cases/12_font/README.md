# 案例 12：字体 — 字体反爬（字形映射）与字体指纹（安装列表）

> 💡 一句话理解：字体在反爬里有两个相反的角色——「字体反爬」用自定义字体把数据藏进字形，「字体指纹」用已安装字体识别设备，别混淆。

> 📖 文档型案例（基于公开资料整理）。「字体」在反爬里有两个完全不同的角色，
> 别混淆：一个是**混淆数据用的字体反爬**，一个是**识别设备用的字体指纹**。

## 一、字体反爬（字形映射混淆）

**场景**：猫眼票房、大众点评、汽车之家等站点的价格/评分数字，页面源码里是乱码，
渲染出来却正常——因为使用了自定义字体把字符映射到错误字形。

| 步骤 | 方法 |
|------|------|
| 1. 定位字体 | 检查页面控件的 font-family → Network 面板找 Font 文件（.woff/.ttf） |
| 2. 解析字体 | `fontTools` 将字体转 XML，提取 cmap 字形→字符映射表 |
| 3. 还原映射 | 多次对比字体文件找不变的映射规律（编号与真实字符的对应关系） |
| 4. 校验 | 对还原结果与页面渲染截图比对 |

公开资料中的「万能方案」组合：`fontTools`（解析映射）+ `ddddocr`（渲染识别兜底）。

## 二、字体指纹（已安装字体检测）

**场景**：不同系统/用户安装的字体集合不同。用 `canvas.measureText()` 对同一段文本
以不同字体测量宽度，宽度与基线不同说明该字体已安装（macOS 的 Helvetica Neue、
Windows 的 Segoe UI、Office/Adobe 套件字体……组合接近唯一）。

检测逻辑（对应本仓库 `all_fp.js` 的 `getFontFingerprint`）：

```
基准宽度 = measureText('mmmmmmmmlli', '72px monospace')
for 每个候选字体:
    宽度 = measureText(同文本, '72px "候选字体", monospace')
    if 宽度 != 基准宽度 → 已安装
```

## 本工具集的应用

| 能力 | 位置 | 说明 |
|------|------|------|
| 字体指纹采集 | `all_fp.js#getFontFingerprint` | 16 字体候选列表 + measureText 检测，浏览器/Node 通用 |
| 字体宽度注入 | `fp_env_patch.js` 的 `fontWidthsRaw` | `{ "Arial": 89.5, ... }` 精确复现真实浏览器测量宽度 |
| 字体反爬解析 | 不涉及 | 字形映射属另一个问题域（fontTools），但常与本类站点采集共存 |

> 已知边界见 `cases/01_parity_demo`：报告 JSON 目前只含「已安装字体列表」，
> 不含逐字体宽度——精确复现需手动补 `fontWidthsRaw`。

## 参考来源

- 反爬篇 | 手把手教你处理 JS 逆向之字体反爬 — https://juejin.cn/post/7116338520196644894
- 字体反爬万能方案简单版（fontTools + ddddocr）— https://www.cnblogs.com/ranbox/p/18461036
- 现代网页反爬机制实战解析：从字体混淆到 TLS 指纹 — https://blog.csdn.net/weixin_32428571/article/details/161298778
- JavaScript 逆向与爬虫实战——css 反爬之动态字体 — https://jishuzhan.net/article/1983543592640643073
- Selenium 绕过 FingerprintJS 浏览器指纹反爬技术 — https://developer.aliyun.com/article/1575177

## 状态

- [x] 机制文档
- [x] 字体指纹部分本仓库已有实现（getFontFingerprint + fontWidthsRaw 注入）
- [ ] 字体反爬（fontTools 字形映射）demo 脚本
