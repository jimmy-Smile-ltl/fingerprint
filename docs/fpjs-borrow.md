# 与 FingerprintJS 的对照：借了什么、没借什么

阅读对象：[fingerprintjs/fingerprintjs](https://github.com/fingerprintjs/fingerprintjs) **v5.3.0**（MIT），
在线体验 <https://fingerprintjs.github.io/fingerprintjs/>。

结论先说：**借的是思路和取舍，不是代码**。它的 42 个熵源没有一个被整段搬进来——我们的 28 个维度
按自己的三档信号模型（红 / 黄 / 只展示）重写，参数和判定阈值也不同。下面逐项记录差异，方便日后
升级时对照，也方便说明哪些结论是有出处的。

---

## 一、组件模型与规范化哈希（借鉴最多的一处）

FingerprintJS 的每个熵源只返回一个值或其错误，由 `src/utils/entropy_source.ts` 统一包成
`{value}` / `{error}` 并记录 `duration`；`src/agent.ts` 再把所有组件拼成规范化字符串后哈希：

```ts
// FingerprintJS v5.3.0, src/agent.ts
function componentsToCanonicalString(components: UnknownComponents) {
  let result = ''
  for (const componentKey of Object.keys(components).sort()) {
    const component = components[componentKey]
    const value = 'error' in component ? 'error' : JSON.stringify(component.value)
    result += `${result ? '|' : ''}${componentKey.replace(/([:|\\])/g, '\\$1')}:${value}`
  }
  return result
}

export function hashComponents(components: UnknownComponents): string {
  return x64hash128(componentsToCanonicalString(components))
}
```

我们照这个思路实现了 `all_fp.js` 的 `canonicalComponentString()`：

```js
// all_fp.js:75
const entries = [
  ['canvas', components.canvas && components.canvas.rawData],
  ['webglBasic', components.webglBasic],
  ['webglAdvanced', components.webglAdvanced],
  ['audio', components.audio && components.audio.rawData],
  ['fonts', components.fonts],
  ['hardware', components.hardware],
  ['timezone', components.timezone]
];
return entries.map(([key, value]) => {
  const text = value === undefined || value === null ? 'error'
    : (typeof value === 'string' ? value : JSON.stringify(value));
  return `${key}:${text.replace(/[:|\\]/g, '\\$&')}`;
}).join('|');
```

| 项 | FingerprintJS | 本项目 |
|---|---|---|
| 组件形状 | `{value}` / `{error}` + `duration` | 直接是采集结果对象 |
| 参与哈希的组件 | 42 个熵源全部参与 | 固定 7 个身份组件（Canvas / WebGL 基础+高级 / Audio / 字体 / 硬件 / 时区） |
| 键序 | `keys.sort()` | 固定数组顺序（等价于固定键序，不依赖对象枚举顺序） |
| 缺失值 | 记为 `error` | 记为 `error` |
| 转义 | `[:|\\]` 前加反斜杠 | 同 |
| 哈希 | `x64hash128`（MurmurHash3 128 位 → 32 hex） | MD5（32 hex，已有依赖，避免再引一份哈希实现） |
| 版本 | 结果带 `version`（取 `package.json`） | 结果带 `version`（`FINGERPRINT_VERSION = 'v1'`） |

**为什么扩展维度不进 `visitorId`**：它们依赖页面权限、用户设置和浏览器版本，跨 Node 复现时会漂移。
FingerprintJS 也承认熵源集合「不受 Semantic Versioning 约束」，随时可能变。

## 二、版本策略

FingerprintJS 的 `docs/version_policy.md` 写明：**标识符只在同一 minor 版本内可比**，minor 升级可能
换算法。这不是客套——熵源一增一减，哈希输入就变了。

我们的做法一样，但更保守：`FINGERPRINT_VERSION` 只在**组件集合或计算口径**变化时递增，
当前为 `v1`。页面报告和 `getFingerprint()` 都同时输出 `visitorId` 与 `version`，比对前先看版本。

## 三、源排序：异步源先跑，WebGL 放最后

`src/sources/index.ts` 的 `sources` 对象就是执行顺序，原作者留了两段注释：

```ts
// The asynchronous sources are at the start to run in parallel with other sources.
userAgentData: getUserAgentData,
fonts: getFonts,
domBlockers: getDomBlockers,
fontPreferences: getFontPreferences,
audio: getAudioFingerprint,
screenFrame: getScreenFrame,
...
// Some sources can affect other sources (e.g. WebGL can affect canvas), so it's important to run these sources
// after other sources.
webGlBasics: getWebGlBasics,
webGlExtensions: getWebGlExtensions,
```

我们沿用了一条关键约束：**Canvas 先采、WebGL 后采**（`getComponents()` 里 Canvas 在 WebGL 之前），
避免创建 WebGL 上下文改变后续 Canvas 的渲染结果。

## 四、逐项借鉴清单

| 思路 | FingerprintJS 出处 | 本项目落点 | 我们改了什么 |
|---|---|---|---|
| 诱饵元素探测内容拦截器 | `src/sources/dom_blockers.ts`：45 套过滤清单（EasyList / AdGuard / Fanboy 等）每套 5 个选择器，`forceShow()` 保证 `visibility:hidden; display:block!important`，`!offsetParent` 判为拦截，某份清单被挡超过 **60%** 就认定它生效；仅 WebKit / Android 运行 | `supplemental_fp.js:827` `collectContentBlockers()` | 只取 17 个通用选择器（不搬混淆的过滤清单）；比例阈值 **50%** 且只给结论，不进哈希；**增加对照组**：中性 div 也不可见时直接返回「无法判断」，避免把测量环境问题当成拦截器 |
| 屏幕边框 | `src/sources/screen_frame.ts`：四边 = `[availTop, width-availWidth-availLeft, height-availHeight-availTop, availLeft]`，保留 10 位小数；Safari 17+ 与 Firefox 143+ 直接返回 `undefined` | `supplemental_fp.js:752` `collectEnvDetails().edges` | 同样的四边公式；只展示、不参与异常判定；不伪造 Safari/Firefox 的弃用逻辑，改为在维度说明里写清「部分浏览器恒为 0」 |
| 私有全局对象识别品牌 | `src/sources/vendor_flavors.ts`：`chrome`、`safari`、`__crWeb`、`__gCrWeb`、`yandex`、`__yb`、`__ybro`、`__firefox__`、`__edgeTrackingPreventionStatistics`、`webkit`、`oprt`、`samsungAr`、`ucweb`、`UCShellJava`、`puffinDevice`，结果 `sort()` | 同文件 `flavorKeys` | 键名照抄（这就是事实清单）；不 `sort()`，保留探测顺序；只在值为对象时计入 |
| 预设字体的渲染宽度 | `src/sources/font_preferences.ts`：`presets` 7 组（`default`/`apple`/`serif`/`sans`/`mono`/`min`/`system`），样本文本 `'mmMwWLliI0fiflO&1'`（m/w 最宽且含连字），Chromium 128+ 乘 `devicePixelRatio` 抵消 CSS 缩放 | `supplemental_fp.js:615` `measureFontPreferences()` | 取 4 组（`serif`/`sans`/`mono`/`system`），样本文本照抄；Chromium 128+ 同样按 DPR 归一；结果 `floor` 到 3 位小数（FPJS 是原值） |
| `AudioContext.baseLatency` 的平台取舍 | `src/sources/audio_base_latency.ts`：只在 `isAndroid() \|\| isWebKit()` 时读取，注释写明「Chrome/Firefox 会告警」 | `supplemental_fp.js:789` | 同一条取舍，但我们按 UA 判 WebKit 且**明确显示「未读取」和原因**，不返回 `-2` 这类哨兵值 |
| 熵源失败不抛错 | `src/utils/entropy_source.ts` 把异常收敛成 `{error}`，单个源失败不影响整体指纹 | 各 `collect*()` 返回 `{available:false, reason}` | 同思路；页面对每个不可用维度显示原因而不是空白 |

## 五、明确没有借鉴的部分

| 项 | 为什么不借 |
|---|---|
| 42 个熵源全集 | 一半是浏览器特性探测（`hdr`、`monochrome`、`forcedColors`、`applePay`、`privateClickMeasurement`…），与「补环境攻防」主题无关；我们的维度按补环境里**容易被伪造或容易露馅**的信号挑选 |
| `x64hash128` | 我们只需要 32 位 hex 的稳定哈希，MD5 已够用且已有依赖；换哈希会让历史 `visitorId` 全部失效 |
| 混淆的过滤清单 | FPJS 把清单做了 base64 + 打散，规避「拦截器专门针对探测代码」；我们只需要一个量级判断，不做对抗性隐藏 |
| 置信度评分（`confidence.ts`） | 它基于浏览器安装量统计做贝叶斯估计，需要服务端数据；本项目纯本地，给不出有意义的分数 |
| 篡改自检 / 反调试 | **开源版没有**，属 Pro/服务端能力。我们的「篡改自检」是自己实现的：`Function.prototype.toString` 读原生函数是否仍返回 `[native code]`，外加 `navigator.plugins` 的 `[[Class]]`、`document.all` 松散相等、原型链等结构检查（`supplemental_fp.js:888`） |
| 网络上报 | 开源版默认带一条安装量监测请求；本项目完全本地计算，报告只留在页面里 |

## 六、对攻防的启发

1. **单向哈希不是安全边界**：FPJS 明确说组件明文可以回传服务端、哈希只是省流量的索引。站点侧真正
   有价值的是组件本身，不是那串 hex——所以补环境要逐组件对齐，而不是伪造一个 `visitorId`。
2. **版本化是诚实的表现**：熵源会变，指纹就会变。看到站点换版本还拿旧 ID 比对，结论一定是错的。
3. **探测代码本身会暴露探测者**：诱饵元素、`offsetParent`、`toString` 自检都是双向的——站点在测你，
   你也在测站点在测什么。我们的「篡改自检」维度就是把这个过程摊开给人看。
4. **平台差异要认**：FPJS 对 `screen.frame`、`baseLatency` 做了明确的平台禁用，而不是硬采。我们沿用
   这个态度：读不到就写原因，不猜。

---

## 许可与致谢

FingerprintJS 以 **MIT License** 发布（Copyright (c) 2025 FingerprintJS, Inc）。本项目的代码为独立实现，
未复制其源码；上文为了说明借鉴关系引用了少量函数与注释片段，这些片段同样属于 MIT 许可范围。
如果你要复用本项目的代码，遵守根目录的 [LICENSE](../LICENSE)（MIT）即可。

参考链接：

- 仓库：<https://github.com/fingerprintjs/fingerprintjs>
- 版本策略：`docs/version_policy.md`
- 与商业版对比：`docs/comparison.md`
