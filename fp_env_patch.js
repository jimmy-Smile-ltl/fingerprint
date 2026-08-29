/**
 * fp_env_patch.js — 浏览器指纹 Node.js 补环境
 *
 * 为 all_fp.js 提供完整的 Node.js 运行环境，覆盖全部 6 个指纹维度。
 * 每个维度的值可通过环境变量或 setFingerprintConfig() 自定义注入。
 *
 * 原型链策略（一一对应真实浏览器）:
 *   window          → Window.prototype          (instanceof Window)
 *   document        → Document.prototype         (instanceof Document)
 *   navigator       → Navigator.prototype        (instanceof Navigator)
 *   screen          → Screen.prototype           (instanceof Screen)
 *   canvas.getContext('2d')  → 实例.__proto__ → CanvasRenderingContext2D.prototype
 *   canvas.getContext('webgl') → 实例.__proto__ → WebGLRenderingContext.prototype
 *   new OfflineAudioContext → OfflineAudioContext.prototype  (instanceof)
 *
 * 框架参考: run_js_proto.js — 瑞数补环境增强版
 *
 * 用法:
 *   // 1. 默认指纹（内置固定值）
 *   require('./fp_env_patch.js');
 *   const mod = await import('./all_fp.js');
 *   console.log(mod.getCanvasFingerprint());
 *
 *   // 2. 注入自定义指纹值
 *   const { setFingerprintConfig } = require('./fp_env_patch.js');
 *   setFingerprintConfig({
 *     gpuVendor:   'NVIDIA Corporation',
 *     gpuRenderer: 'GeForce RTX 4090/PCIe/SSE2',
 *     audioSeed:   0.123456789,
 *     canvasSeed:  'my-custom-seed-v1',
 *   });
 *
 *   // 3. 环境变量注入（在 require 之前设置）
 *   //   FP_GPU_VENDOR="Apple" FP_GPU_RENDERER="M3 Pro" node your_script.js
 */

// ============================================================================
// 0. 配置管理
// ============================================================================

// 环境变量整数解析（区分"未设置"与"0"——0 是合法值，如 FP_UTC_OFFSET=0 表示 UTC）
function _envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

const FP_CONFIG = {
  // Navigator
  userAgent:           process.env.FP_USER_AGENT
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  platform:            process.env.FP_PLATFORM            || 'Win32',
  hardwareConcurrency: parseInt(process.env.FP_CPU_CORES) || 16,
  deviceMemory:        parseInt(process.env.FP_RAM_GB)    || 8,
  languages:           ['zh-CN', 'zh', 'en-US'],
  maxTouchPoints:      parseInt(process.env.FP_TOUCH_POINTS) || 0,

  // Screen
  screenWidth:     1920,
  screenHeight:    1080,
  availWidth:      1920,
  availHeight:     1040,
  colorDepth:      30,
  pixelDepth:      30,

  // GPU (WebGL)
  gpuVendor:   process.env.FP_GPU_VENDOR   || 'Google Inc. (Intel)',
  gpuRenderer: process.env.FP_GPU_RENDERER || 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  gpuMaxTextureSize: 16384,
  gpuMaxViewportDims: [16384, 16384],
  gpuMaxVertexAttribs: 16,

  // Canvas
  canvasSeed:    process.env.FP_CANVAS_SEED || 'fp-default-seed-v2',
  canvasWidth:   280,
  canvasHeight:  60,

  // Canvas 真实数据注入（优先级高于 canvasSeed）
  // 设置后，toDataURL() 直接返回此值，不再用 seed 生成
  canvasDataURL: null,              // 基础 Canvas 指纹的 toDataURL 结果
  canvasDataURLAdvanced: null,       // 高级 Canvas 指纹的 toDataURL 结果

  // Audio
  audioSeed: parseFloat(process.env.FP_AUDIO_SEED) || 124.04347527516074,

  // Audio 真实数据注入（优先级高于 audioSeed）
  // 设置后，getChannelData() 直接返回此数组
  audioRawSamples: null,             // 真实浏览器采集的 getChannelData 数组

  // WebGL 真实数据注入（优先级高于各字段默认值）
  webglVendorRaw:            null,   // gl.getParameter(VENDOR) 真实值
  webglRendererRaw:          null,   // gl.getParameter(RENDERER) 真实值
  webglVersionRaw:           null,   // gl.getParameter(VERSION) 真实值
  webglShadingLangVersionRaw: null,  // gl.getParameter(SHADING_LANGUAGE_VERSION) 真实值
  webglUnmaskedVendorRaw:    null,   // 真实 GPU 厂商（覆盖 gpuVendor）
  webglUnmaskedRendererRaw:  null,   // 真实 GPU 型号（覆盖 gpuRenderer）
  webglExtensionsRaw:        null,   // 真实扩展列表（覆盖 webglExtensions）
  webglShaderPixelsRaw:      null,   // readPixels 真实结果

  // 字体真实数据注入
  // 设置后，measureText 使用此映射表返回真实宽度
  fontWidthsRaw: null,               // { "Arial": 89.5, "Times": 85.2, ... }

  // Timezone
  timezone:       process.env.FP_TIMEZONE       || 'Asia/Shanghai',
  timezoneOffset: _envInt('FP_UTC_OFFSET', -480),

  // WebGL 扩展列表（不同 GPU 支持不同扩展）
  webglExtensions: [
    'ANGLE_instanced_arrays',
    'EXT_blend_minmax',
    'EXT_color_buffer_half_float',
    'EXT_disjoint_timer_query',
    'EXT_float_blend',
    'EXT_frag_depth',
    'EXT_shader_texture_lod',
    'EXT_texture_compression_bptc',
    'EXT_texture_compression_rgtc',
    'EXT_texture_filter_anisotropic',
    'EXT_sRGB',
    'OES_element_index_uint',
    'OES_fbo_render_mipmap',
    'OES_standard_derivatives',
    'OES_texture_float',
    'OES_texture_float_linear',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'WEBGL_color_buffer_float',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_s3tc_srgb',
    'WEBGL_debug_renderer_info',
    'WEBGL_debug_shaders',
    'WEBGL_depth_texture',
    'WEBGL_draw_buffers',
    'WEBGL_lose_context',
    'WEBGL_multi_draw',
  ],
};

/**
 * 更新配置（在 require 后调用）
 */
function setFingerprintConfig(overrides) {
  Object.assign(FP_CONFIG, overrides);
  // 同步更新子配置
  if (overrides.screenWidth  != null) FP_CONFIG.availWidth  = overrides.screenWidth;
  if (overrides.screenHeight != null) FP_CONFIG.availHeight = overrides.screenHeight;
  // 真实 GPU 数据注入同步
  if (overrides.webglUnmaskedVendorRaw != null)   FP_CONFIG.gpuVendor   = overrides.webglUnmaskedVendorRaw;
  if (overrides.webglUnmaskedRendererRaw != null) FP_CONFIG.gpuRenderer = overrides.webglUnmaskedRendererRaw;
  if (overrides.webglExtensionsRaw != null)       FP_CONFIG.webglExtensions = overrides.webglExtensionsRaw;
}

/**
 * 一键注入真实浏览器指纹数据
 *
 * 用法:
 *   1. 在浏览器中打开 test_fp.html，采集指纹
 *   2. 点击"复制报告 JSON"，得到完整 fingerprint 对象
 *   3. 在 Node.js 中调用:
 *      const report = require('./browser_fingerprint.json');
 *      injectRealFingerprint(report);
 *      const mod = await import('./all_fp.js');
 *      // 现在 Node.js 输出的指纹与浏览器完全一致
 *
 * @param {Object} browserReport - 从 test_fp.html 复制的完整报告对象
 * @param {Object} browserReport.components - 各维度指纹组件
 */
function injectRealFingerprint(browserReport) {
  if (!browserReport || !browserReport.components) {
    console.error('[fp_env_patch] injectRealFingerprint: 需要 { components: {...} } 格式的报告');
    return;
  }
  const c = browserReport.components;
  const cfg = {};

  // --- Canvas: 注入真实 toDataURL ---
  // 注意: all_fp.js 的 components.canvas 采集的是高级画布
  //       (280x60, getCanvasFingerprintAdvanced)，基础画布 (200x50) 不在报告中
  if (c.canvas && c.canvas.rawData) {
    cfg.canvasDataURLAdvanced = c.canvas.rawData;
    cfg.canvasDataURL = c.canvas.rawData;   // 兼容: 基础画布未采集，沿用同一 DataURL
    console.log('[fp_env_patch] ✅ Canvas toDataURL 已注入 (基础+高级)');
  }

  // --- WebGL: 解析真实 GPU 参数 ---
  if (c.webglBasic) {
    const params = {};
    c.webglBasic.split('|').forEach(item => {
      const [k, ...v] = item.split(':');
      params[k] = v.join(':');
    });
    if (params.unmaskedVendor)   { cfg.webglUnmaskedVendorRaw   = params.unmaskedVendor;   cfg.gpuVendor   = params.unmaskedVendor; }
    if (params.unmaskedRenderer) { cfg.webglUnmaskedRendererRaw = params.unmaskedRenderer; cfg.gpuRenderer = params.unmaskedRenderer; }
    if (params.vendor)           cfg.webglVendorRaw   = params.vendor;
    if (params.renderer)         cfg.webglRendererRaw = params.renderer;
    if (params.version)          cfg.webglVersionRaw  = params.version;
    if (params.shadingLangVersion) cfg.webglShadingLangVersionRaw = params.shadingLangVersion;
    if (params.maxTextureSize)   cfg.gpuMaxTextureSize = parseInt(params.maxTextureSize) || 16384;
    if (params.maxVertexAttribs) cfg.gpuMaxVertexAttribs = parseInt(params.maxVertexAttribs) || 16;
    if (params.maxViewportDims) {
      const dims = params.maxViewportDims.split(',').map(Number);
      if (dims.length >= 2 && dims.every(n => !Number.isNaN(n))) cfg.gpuMaxViewportDims = dims.slice(0, 2);
    }
    // 扩展列表
    if (params.extensions) {
      cfg.webglExtensionsRaw = params.extensions.split(',');
      cfg.webglExtensions    = cfg.webglExtensionsRaw;
    }
    console.log('[fp_env_patch] ✅ WebGL GPU: ' + (cfg.gpuVendor || '保持默认'));
  }

  // --- WebGL 着色器像素 ---
  if (c.webglAdvanced && c.webglAdvanced !== 'N/A') {
    cfg.webglShaderPixelsRaw = c.webglAdvanced;
    console.log('[fp_env_patch] ✅ WebGL Shader Pixels 已注入');
  }

  // --- Audio: 注入真实采样点 ---
  if (c.audio && c.audio.rawData && c.audio.rawData !== 'timeout' && c.audio.rawData !== 'not_available') {
    cfg.audioRawSamples = c.audio.rawData.split(',').map(Number);
    console.log('[fp_env_patch] ✅ Audio 采样点已注入 (' + cfg.audioRawSamples.length + ' 个)');
  }

  // --- 硬件 ---
  if (c.hardware) {
    if (c.hardware.deviceMemory)       cfg.deviceMemory        = c.hardware.deviceMemory;
    if (c.hardware.hardwareConcurrency) cfg.hardwareConcurrency = c.hardware.hardwareConcurrency;
    if (c.hardware.maxTouchPoints != null) cfg.maxTouchPoints  = c.hardware.maxTouchPoints;
    if (c.hardware.platform)           cfg.platform            = c.hardware.platform;
    console.log('[fp_env_patch] ✅ 硬件: ' + cfg.platform + ', ' + cfg.hardwareConcurrency + ' 核, ' + cfg.deviceMemory + 'GB');
  }

  // --- 时区 ---
  if (c.timezone) {
    if (c.timezone.timezone)       cfg.timezone       = c.timezone.timezone;
    if (c.timezone.timezoneOffset != null) cfg.timezoneOffset = c.timezone.timezoneOffset;
    if (c.timezone.languages)      cfg.languages      = Array.isArray(c.timezone.languages) ? c.timezone.languages : [c.timezone.language];
    console.log('[fp_env_patch] ✅ 时区: ' + cfg.timezone + ', UTC' + (cfg.timezoneOffset > 0 ? '+' : '') + (-cfg.timezoneOffset / 60) + 'h');
  }

  // --- 屏幕 ---
  if (c.hardware) {
    // 屏幕信息可以从 window.screen 采集（如果有的话）
  }

  // 应用所有配置
  setFingerprintConfig(cfg);
  console.log('[fp_env_patch] 🎯 真实指纹注入完成！Node.js 将输出与浏览器一致的指纹。');
}

// ============================================================================
// 1. 基础框架 — safeFunction() / updateFunToString()
// ============================================================================

/**
 * 伪装函数 toString，使其返回 `function xxx() { [native code] }`
 * 参考: _ab_env_ok.js 的 updateFunToString
 */
const _native_toString_symbol = Symbol('function_toString');

function updateFunToString(func, extName) {
  let toStr = `function ${func.name || ''}() { [native code] }`;
  if (extName && func.name) {
    toStr = `function ${extName} ${func.name}() { [native code] }`;
  } else if (extName) {
    toStr = `function ${extName}() { [native code] }`;
  }
  Object.defineProperty(func, _native_toString_symbol, {
    enumerable: false, configurable: true, writable: true, value: toStr
  });
  return func;
}

!(function patchToString() {
  const originToString = Function.prototype.toString;
  // 保存原始 toString（getter 属性检测会用到）
  globalThis._originFunctionToString = originToString;
  Object.defineProperty(Function.prototype, 'toString', {
    enumerable: false, configurable: true, writable: true,
    value: function toString() {
      return this[_native_toString_symbol] || originToString.call(this);
    }
  });
  updateFunToString(Function.prototype.toString);
})();

/**
 * 辅助: 给任意函数的实例也打上 toStringTag
 */
function setNativeTag(obj, tagName) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: tagName, writable: false, enumerable: false, configurable: true
  });
}

/**
 * 辅助: 安全设置属性描述符
 */
function defProp(obj, key, opts) {
  Object.defineProperty(obj, key, {
    enumerable: false, configurable: true, writable: true, ...opts
  });
}

// ============================================================================
// 2. 全局对象 — global / window / self / top / parent
// ============================================================================

// Window 构造函数（原型链: instanceof Window）
Window = function Window() {};
setNativeTag(Window.prototype, 'Window');
window = global;
window.__proto__ = Window.prototype;
self = top = parent = window;

// 清理 Node.js 特有的全局变量（sloppy mode + try-catch 防 strict mode 报错）
try { delete GLOBAL; } catch (e) {}
try { delete root; } catch (e) {}
try { delete __filename; } catch (e) {}
try { delete __dirname; } catch (e) {}

window.top = window;
window.name = '';
window.window = window;
window.self = window;

// 注入全局对象（逐属性定义，避免 getter-only 冲突如 crypto）
function _safeSet(obj, props) {
  for (const key of Object.keys(props)) {
    try {
      // 使用 defineProperty 覆盖，避免 getter-only 冲突
      Object.defineProperty(obj, key, {
        value: props[key],
        writable: true,
        enumerable: true,
        configurable: true
      });
    } catch (e) {
      // 如果 defineProperty 也失败（极少数情况），跳过
    }
  }
}

_safeSet(window, {
  Math:     Math,
  Date:     Date,
  parseInt: parseInt,
  parseFloat: parseFloat,
  JSON:     JSON,
  eval:     eval,
  atob:     (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa:     (s) => Buffer.from(s, 'binary').toString('base64'),
  isNaN:    isNaN,
  isFinite: isFinite,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  escape:   escape,
  unescape: unescape,
  RegExp:   RegExp,
  Number:   Number,
  String:   String,
  Array:    Array,
  Object:   Object,
  Boolean:  Boolean,
  Error:    Error,
  TypeError: TypeError,
  Promise:  Promise,
  ArrayBuffer: ArrayBuffer,
  Uint8Array: Uint8Array,
  Float32Array: Float32Array,
  Int32Array: Int32Array,
  DataView: DataView,
  Symbol:   Symbol,
  Map:      Map,
  Set:      Set,
  WeakMap:  WeakMap,
  WeakSet:  WeakSet,
  Proxy:    Proxy,
  Reflect:  Reflect,

  // Node.js crypto → window.crypto（仅在 crypto 不存在时设置）
  // ...crypto handled separately below

  // Stub: 无实际操作的 API
  addEventListener:    function () {},
  removeEventListener: function () {},
  dispatchEvent:       function () {},
  requestAnimationFrame: function (cb) { return setTimeout(cb, 16); },
  cancelAnimationFrame:  function (id) { clearTimeout(id); },
  fetch:               globalThis.fetch || function () { return Promise.reject(new Error('fetch not available')); },
  open:                function () { return {}; },
  close:               function () {},
  alert:               function () {},
  confirm:             function () { return true; },
  prompt:              function () { return null; },
  print:               function () {},
  postMessage:         function () {},
  getSelection:        function () { return { toString: function () { return ''; } }; },
  matchMedia:          function () { return { matches: false, media: '', addListener: function () {} }; },

  // Window 尺寸
  innerWidth:  1920,
  innerHeight: 960,
  outerWidth:  1920,
  outerHeight: 1080,
  screenX:     0,
  screenY:     0,
  pageXOffset: 0,
  pageYOffset: 0,
  scrollX:     0,
  scrollY:     0,
  devicePixelRatio: 2,

  // Chrome 对象
  chrome: {
    app: {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
    },
    runtime: {},
    loadTimes: function () {},
    csi: function () {},
  },

  // 明确 undefined 的属性（反检测关键）
  webdriver: false,
  ActiveXObject: undefined,
  globalStorage: undefined,
  showModalDialog: undefined,
  external: undefined,
  SharedWorker: undefined,
  WebSocket: undefined,
});

// 同步到全局作用域（使不带 window. 的引用也能工作）
for (const key of Object.keys(window)) {
  if (!(key in globalThis) || key === 'window') {
    try { globalThis[key] = window[key]; } catch (e) {}
  }
}

// ============================================================================
// 3. Timer 修复 — 过 toString 检测 + 立即执行
// ============================================================================

!(function () {
  const _setTimeout   = globalThis.setTimeout;
  const _setInterval  = globalThis.setInterval;
  const _clearTimeout = globalThis.clearTimeout;
  const _clearInterval = globalThis.clearInterval;

  // 保存原始 setTimeout 引用（Audio 等需要真实异步的场景使用）
  window._realSetTimeout = _setTimeout;

  setTimeout = function (fn, delay) {
    // 保留原始延迟行为（指纹环境不需要 RS 的立即执行策略）
    if (typeof fn === 'function') return _setTimeout(fn, delay || 0);
    return _setTimeout(fn, delay);
  };
  updateFunToString(setTimeout);
  setTimeout.toString = function () { return _setTimeout.toString(); };

  setInterval = function (fn, delay) {
    if (typeof fn === 'function') return _setInterval(fn, delay || 0);
    return _setInterval(fn, delay);
  };
  updateFunToString(setInterval);
  setInterval.toString = function () { return _setInterval.toString(); };

  clearTimeout = function (id) { return _clearTimeout(id); };
  updateFunToString(clearTimeout);
  clearInterval = function (id) { return _clearInterval(id); };
  updateFunToString(clearInterval);

  Object.assign(window, {
    setTimeout, setInterval, clearTimeout, clearInterval
  });
})();

// ============================================================================
// 4. Navigator — 硬件信息 + 语言 + 时区
// ============================================================================

Navigator = function Navigator() {};
Navigator.prototype = {
  get userAgent()   { return FP_CONFIG.userAgent; },
  get platform()    { return FP_CONFIG.platform; },
  get vendor()      { return 'Google Inc.'; },
  get vendorSub()   { return ''; },
  get product()     { return 'Gecko'; },
  get productSub()  { return '20030107'; },
  get appName()     { return 'Netscape'; },
  get appVersion()  { return '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'; },
  get appCodeName() { return 'Mozilla'; },
  get language()    { return FP_CONFIG.languages[0]; },
  get languages()   { return [...FP_CONFIG.languages]; },
  get cookieEnabled() { return true; },
  get onLine()      { return true; },
  get doNotTrack()  { return null; },
  get webdriver()   { return false; },
  get hardwareConcurrency() { return FP_CONFIG.hardwareConcurrency; },
  get deviceMemory()        { return FP_CONFIG.deviceMemory; },
  get maxTouchPoints()      { return FP_CONFIG.maxTouchPoints; },
  get pdfViewerEnabled()    { return true; },
  get javaEnabled()         { return function javaEnabled() { return false; }; },
  get plugins()     { return createEmptyPluginArray(); },
  get mimeTypes()   { return createEmptyPluginArray(); },
  get permissions() { return { query: function () { return Promise.resolve({ state: 'prompt' }); } }; },
  get mediaDevices(){ return { enumerateDevices: function () { return Promise.resolve([]); } }; },
  get serviceWorker(){ return { controller: null, ready: Promise.resolve({ scope: '/', active: null, installing: null, waiting: null }) }; },
  get storage()     { return { estimate: function () { return Promise.resolve({}); } }; },
  get credentials() { return {}; },
  get keyboard()    { return {}; },
  get locks()       { return {}; },
  get presentation(){ return {}; },
  get scheduling()  { return {}; },
  get geolocation() { return {}; },
  get bluetooth()   { return {}; },
  get usb()         { return {}; },
  get xr()          { return {}; },
  get hid()         { return {}; },
  get serial()      { return {}; },
  get clipboard()   { return { readText: function () {}, writeText: function () {} }; },
  // 供 taint 检测
  taintEnabled:     function () { return false; },
  sendBeacon:       function () { return true; },
  vibrate:          function () { return true; },
};
setNativeTag(Navigator.prototype, 'Navigator');
updateFunToString(Navigator);

// 创建 navigator 实例（__proto__ 指向 Navigator.prototype → instanceof Navigator = true）
navigator = {};
navigator.__proto__ = Navigator.prototype;
window.navigator = navigator;
window.clientInformation = navigator;

// 辅助: 空 PluginArray / MimeTypeArray（保持原型链）
function createEmptyPluginArray() {
  const arr = [];
  arr.__proto__ = (function PluginArray() {}).prototype;
  setNativeTag(arr, 'PluginArray');
  arr.refresh = function () {};
  arr.namedItem = function () { return null; };
  return arr;
}

// ============================================================================
// 5. Screen
// ============================================================================

Screen = function Screen() {};
Screen.prototype = {
  get width()        { return FP_CONFIG.screenWidth; },
  get height()       { return FP_CONFIG.screenHeight; },
  get availWidth()   { return FP_CONFIG.availWidth; },
  get availHeight()  { return FP_CONFIG.availHeight; },
  get colorDepth()   { return FP_CONFIG.colorDepth; },
  get pixelDepth()   { return FP_CONFIG.pixelDepth; },
  get availLeft()    { return 0; },
  get availTop()     { return 0; },
  get orientation()  { return { angle: 0, type: 'landscape-primary', onchange: null }; },
  toString: function () { return '[object Screen]'; }
};
setNativeTag(Screen.prototype, 'Screen');
updateFunToString(Screen);

screen = new Screen();
window.screen = screen;

// ============================================================================
// 6. Location
// ============================================================================

Location = function Location() {};
Location.prototype = {
  ancestorOrigins: {},
  href:     'https://www.example.com/',
  origin:   'https://www.example.com',
  protocol: 'https:',
  host:     'www.example.com',
  hostname: 'www.example.com',
  port:     '',
  pathname: '/',
  search:   '',
  hash:     '',
  assign:   function (url) {},
  replace:  function (url) {},
  reload:   function () {},
  toString: function () { return this.href; }
};
setNativeTag(Location.prototype, 'Location');
updateFunToString(Location);

location = new Location();
window.location = location;
document = window.document || {};
document.location = location;

// ============================================================================
// 7. History
// ============================================================================

History = function History() {};
History.prototype = {
  state: null,
  scrollRestoration: 'auto',
  length: 2,
  back:     function back() {},
  forward:  function forward() {},
  go:       function go(n) {},
  pushState:    function pushState(s, t, u) {},
  replaceState: function replaceState(s, t, u) {},
  toString: function () { return '[object History]'; }
};
setNativeTag(History.prototype, 'History');
updateFunToString(History);

history = new History();
window.history = history;

// ============================================================================
// 8. Storage — localStorage / sessionStorage
// ============================================================================

!(function () {
  function createStorage() {
    const store = new Map();
    const storage = {
      get length() { return store.size; },
      key: function (n) { return [...store.keys()][n] || null; },
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, v); },
      removeItem: function (k) { store.delete(k); },
      clear: function () { store.clear(); }
    };
    storage.__proto__ = (function Storage() {}).prototype;
    setNativeTag(storage, 'Storage');
    return storage;
  }
  localStorage  = createStorage();
  sessionStorage = createStorage();
  window.localStorage  = localStorage;
  window.sessionStorage = sessionStorage;
})();

// ============================================================================
// 9. Document — createElement('canvas') 等
// ============================================================================

// ---- CanvasRenderingContext2D 原型 ----
CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
const ctx2dProto = CanvasRenderingContext2D.prototype;
Object.assign(ctx2dProto, {
  // 属性（会通过实例.__proto__ 继承）
  canvas:          null, // 由 _createCanvasElement 回填
  fillStyle:       '#000000',
  strokeStyle:     '#000000',
  font:            '10px sans-serif',
  textBaseline:    'alphabetic',
  textAlign:       'start',
  textRendering:   'auto',
  direction:       'ltr',
  filter:          'none',
  fontKerning:     'auto',
  fontStretch:     'normal',
  fontVariantCaps: 'normal',
  globalAlpha:     1,
  globalCompositeOperation: 'source-over',
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
  letterSpacing:   '0px',
  wordSpacing:     '0px',
  lineCap:         'butt',
  lineJoin:        'miter',
  lineWidth:       1,
  miterLimit:      10,
  lineDashOffset:  0,
  shadowBlur:      0,
  shadowColor:     'rgba(0, 0, 0, 0)',
  shadowOffsetX:   0,
  shadowOffsetY:   0,

  // 方法（no-op 或返回固定值）
  fillRect:  function () {},
  strokeRect: function () {},
  clearRect: function () {},
  fillText:  function () {},
  strokeText: function () {},
  beginPath: function () {},
  closePath: function () {},
  moveTo:    function () {},
  lineTo:    function () {},
  arc:       function () {},
  arcTo:     function () {},
  bezierCurveTo: function () {},
  quadraticCurveTo: function () {},
  rect:      function () {},
  ellipse:   function () {},
  stroke:    function () {},
  fill:      function (rule) {},
  clip:      function (rule) {},
  save:      function () {},
  restore:   function () {},
  scale:     function () {},
  rotate:    function () {},
  translate: function () {},
  transform: function () {},
  setTransform: function () {},
  resetTransform: function () {},
  createLinearGradient:  function () { return { addColorStop: function () {} }; },
  createRadialGradient:  function () { return { addColorStop: function () {} }; },
  createConicGradient:   function () { return { addColorStop: function () {} }; },
  createPattern: function () { return null; },
  createImageData: function (w, h) {
    return { width: w, height: h, data: new Uint8Array(w * h * 4) };
  },
  getImageData: function (x, y, w, h) {
    return { width: w, height: h, data: new Uint8Array(w * h * 4) };
  },
  putImageData: function () {},
  drawImage:   function () {},
  getContextAttributes: function () {
    return { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false };
  },
  isContextLost: function () { return false; },
  getLineDash:   function () { return []; },
  setLineDash:   function () {},
  // measureText — 关键！字体检测依赖此方法
  measureText: function (text) {
    // 模拟不同字体下的不同宽度（基于常用字体的真实比例）
    const fontStr = this.font || '10px sans-serif';
    // 归一化主字体名: '72px "Arial", monospace' → 'Arial'; '72px monospace' → 'monospace'
    const primaryFont = fontStr.split(',')[0]
      .replace(/^\d+(\.\d+)?px\s*/, '')
      .replace(/["']/g, '')
      .trim();
    // 真实注入优先: fontWidthsRaw 提供 { "Arial": 89.5, ... }（真实浏览器测量宽度）
    if (FP_CONFIG.fontWidthsRaw &&
        Object.prototype.hasOwnProperty.call(FP_CONFIG.fontWidthsRaw, primaryFont)) {
      return { width: FP_CONFIG.fontWidthsRaw[primaryFont] };
    }
    const baseWidth = text.length * 7.2; // 基准宽度
    // 不同字体对宽度的微调
    if (primaryFont === 'monospace' || primaryFont.includes('monospace'))  return { width: text.length * 8.4 };
    if (primaryFont === 'Arial'      || primaryFont.includes('Arial'))      return { width: baseWidth * 1.02 };
    if (primaryFont === 'Times New Roman' || primaryFont.includes('Times')) return { width: baseWidth * 0.96 };
    if (primaryFont === 'Georgia'    || primaryFont.includes('Georgia'))    return { width: baseWidth * 1.08 };
    if (primaryFont === 'Verdana'    || primaryFont.includes('Verdana'))    return { width: baseWidth * 1.15 };
    if (primaryFont === 'Helvetica'  || primaryFont.includes('Helvetica'))  return { width: baseWidth * 1.03 };
    if (primaryFont === 'Tahoma'     || primaryFont.includes('Tahoma'))     return { width: baseWidth * 1.06 };
    if (primaryFont === 'Segoe UI'   || primaryFont.includes('Segoe'))      return { width: baseWidth * 1.04 };
    if (primaryFont === 'Calibri'    || primaryFont.includes('Calibri'))    return { width: baseWidth * 0.98 };
    if (primaryFont === 'Consolas'   || primaryFont.includes('Consolas'))   return { width: text.length * 8.0 };
    if (primaryFont === 'Comic Sans MS' || primaryFont.includes('Comic'))   return { width: baseWidth * 1.12 };
    if (primaryFont === 'sans-serif') return { width: baseWidth * 1.0 };
    if (primaryFont === 'serif')      return { width: baseWidth * 0.94 };
    return { width: baseWidth };
  },
  // isPointInPath — winding 检测
  isPointInPath: function (x, y, rule) {
    return rule === 'evenodd' ? false : true;
  },
  // 让 ctx 的 toString 正确
  toString: function () { return '[object CanvasRenderingContext2D]'; }
});
setNativeTag(ctx2dProto, 'CanvasRenderingContext2D');
updateFunToString(CanvasRenderingContext2D);

// ---- HTMLCanvasElement 原型 ----
HTMLCanvasElement = function HTMLCanvasElement() {};
const canvasProto = HTMLCanvasElement.prototype;
canvasProto.getContext = function (type) {
  if (type === '2d') {
    const ctx = {};
    ctx.__proto__ = CanvasRenderingContext2D.prototype;
    ctx.canvas = this;
    return ctx;
  }
  if (type === 'webgl' || type === 'experimental-webgl') {
    return _createWebGLContext(this);
  }
  if (type === 'webgl2' || type === 'experimental-webgl2') {
    return _createWebGLContext(this);
  }
  return null;
};
canvasProto.toDataURL = function (type) {
  // 画布尺寸区分: 280x60 = 高级画布 (getCanvasFingerprintAdvanced), 200x50 = 基础画布 (getCanvasFingerprint)
  const isAdvanced = this._advanced || (this.width === 280 && this.height === 60);
  // 优先使用真实浏览器采集的 DataURL（injectRealFingerprint 注入）
  if (isAdvanced && FP_CONFIG.canvasDataURLAdvanced) {
    return FP_CONFIG.canvasDataURLAdvanced;
  }
  if (FP_CONFIG.canvasDataURL) {
    return FP_CONFIG.canvasDataURL;
  }
  // 回退：基于 config 生成稳定 DataURL
  return _generateCanvasDataURL(this.width || 300, this.height || 150);
};
canvasProto.toBlob = function (cb) { cb(new Blob ? new Blob([]) : {}); };
canvasProto.captureStream = function () { return null; };
canvasProto.transferControlToOffscreen = function () { return {}; };
canvasProto.toString = function () { return '[object HTMLCanvasElement]'; };
setNativeTag(canvasProto, 'HTMLCanvasElement');
updateFunToString(HTMLCanvasElement);

// 存储 canvas→ctx 的引用（供 ctx.canvas 使用）
const _canvasRegistry = new WeakMap();

function _createCanvasElement(w, h) {
  const c = {};
  c.__proto__ = HTMLCanvasElement.prototype;
  c.width   = w || FP_CONFIG.canvasWidth;
  c.height  = h || FP_CONFIG.canvasHeight;
  c.style   = {};
  c.dataset = {};
  _canvasRegistry.set(c, null);
  return c;
}

/**
 * 生成稳定的 Canvas DataURL（模拟 toDataURL 输出）
 * 同一 canvasSeed 下输出相同（模拟真实浏览器中 Canvas 指纹的稳定性）
 */
function _generateCanvasDataURL(w, h) {
  // 使用 canvasSeed + 尺寸生成稳定哈希
  const crypto = require('crypto');
  const hash = crypto.createHash('md5')
    .update(FP_CONFIG.canvasSeed + '|' + w + 'x' + h + '|canvas_fingerprint')
    .digest('base64')
    .substring(0, 22);
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEISURBVDiNpZMxTsNAEEX/rNeOAwUlHVdA4gAcAokLIOXIlTgAHVeg4QJIOXJ8AIR8CQiJIho7Xq9nKDayEzuWQ/mVNNqd+c+b3cEqY7PGVwCLIAhKEfEL0H0B3AGIT5LkFohj1I6qoih+OJYNrwB8AjgBaAOYAvjtut5dluWBMeYljuMLVSXL9UooAHAXRRFaa8k5AzAF8A7goSiKCwBXALoAXgG01VoC8Mh4tw3gjRk559z8SHsvSRK01tr3g+ltALcAoqp6A/DELK21D5QCvKhqn6RNvbe3+XjNe9n3GQNgBuCDmS/nvh7AkNa6Z+YrAJ2mmC3yP4A2gCGAgfaayr9v8UPiGnYYvQasJMYA7rTWvz0DALMplXg7vAwAAAAASUVORK5CYII=';
}

// ---- Document 对象 ----
Document = function Document() {};
Document.prototype = {
  createElement: function (tagName) {
    if (tagName === 'canvas') return _createCanvasElement();
    if (tagName === 'div')    return _createDivElement();
    if (tagName === 'span')   return _createSpanElement();
    if (tagName === 'script') return _createScriptElement();
    if (tagName === 'a')      return _createAnchorElement();
    if (tagName === 'form')   return {};
    if (tagName === 'img')    return _createImgElement();
    return _createGenericElement(tagName);
  },
  createElementNS: function (ns, tagName) {
    return this.createElement(tagName);
  },
  createTextNode:    function (text) { return { nodeType: 3, textContent: text }; },
  createComment:     function (text) { return { nodeType: 8, textContent: text }; },
  createDocumentFragment: function () { return { nodeType: 11 }; },
  getElementById:    function (id) { return null; },
  getElementsByTagName: function (tag) {
    if (tag === 'script') return [];
    if (tag === 'meta')   return [];
    return [];
  },
  getElementsByClassName: function (cls) { return []; },
  querySelector:     function () { return null; },
  querySelectorAll:  function () { return []; },
  addEventListener:  function () {},
  removeEventListener: function () {},
  createEvent:       function (type) { return { initEvent: function () {} }; },
  createAttribute:   function (name) { return { name: name, value: '' }; },

  get cookie()       { return ''; },
  set cookie(v)      {},
  get title()        { return ''; },
  set title(v)       {},
  get body()         { return this._hasBody ? this._body : _createGenericElement('body'); },
  set body(v)        { this._body = v; this._hasBody = true; },
  get head()         { return this._hasHead ? this._head : _createGenericElement('head'); },
  set head(v)        { this._head = v; this._hasHead = true; },
  get documentElement() { return this._hasDocEl ? this._documentElement : _createGenericElement('html'); },
  set documentElement(v){ this._documentElement = v; this._hasDocEl = true; },
  get characterSet() { return 'UTF-8'; },
  get charset()      { return 'UTF-8'; },
  get readyState()   { return 'complete'; },
  get hidden()       { return false; },
  get visibilityState() { return 'visible'; },
  get referrer()     { return ''; },
  get all()          { return _createAllCollection(); },
  get images()       { return []; },
  get forms()        { return []; },
  get links()        { return []; },
  get scripts()      { return []; },
  get styleSheets()  { return []; },
  get activeElement(){ return _createGenericElement('body'); },
  get defaultView()  { return window; },
  get scrollingElement() { return _createGenericElement('body'); },
  hasFocus:          function () { return false; },
  execCommand:       function () { return false; },
  getSelection:      function () { return { toString: function () { return ''; } }; },
  open:              function () { return this; },
  close:             function () {},
  write:             function () {},
  writeln:           function () {},
  toString:          function () { return '[object HTMLDocument]'; }
};
setNativeTag(Document.prototype, 'HTMLDocument');
updateFunToString(Document);

// document 实例
document = {};
document.__proto__ = Document.prototype;
window.document = document;
globalThis.document = document;

// ---- 辅助: 各类元素工厂 ----
function _createGenericElement(tag) {
  const el = {};
  el.__proto__ = (function HTMLElement() {}).prototype;
  el.tagName = (tag || 'div').toUpperCase();
  el.nodeType = 1;
  el.style = {};
  el.dataset = {};
  el.classList = { add: function(){}, remove: function(){}, contains: function(){ return false; }, toggle: function(){} };
  el.getAttribute = function (name) { return null; };
  el.setAttribute = function (name, val) {};
  el.removeAttribute = function (name) {};
  el.hasAttribute = function (name) { return false; };
  el.getElementsByTagName = function (tag) { return tag === 'i' ? { length: 0 } : []; };
  el.getElementsByClassName = function (cls) { return []; };
  el.querySelector = function () { return null; };
  el.querySelectorAll = function () { return []; };
  el.appendChild = function (child) { return child; };
  el.removeChild = function (child) { return child; };
  el.replaceChild = function (newChild, oldChild) { return oldChild; };
  el.insertBefore = function (newChild, refChild) { return newChild; };
  el.cloneNode = function (deep) { return _createGenericElement(tag); };
  el.addEventListener = function () {};
  el.removeEventListener = function () {};
  el.dispatchEvent = function () { return true; };
  el.toString = function () { return '[object HTML' + el.tagName.charAt(0) + el.tagName.slice(1).toLowerCase() + 'Element]'; };
  el.parentNode = null;
  el.parentElement = null;
  el.childNodes = [];
  el.children = [];
  el.firstChild = null;
  el.lastChild = null;
  el.nextSibling = null;
  el.previousSibling = null;
  el.innerHTML = '';
  el.innerText = '';
  el.textContent = '';
  el.outerHTML = '';
  el.id = '';
  el.className = '';
  el.hidden = false;
  el.offsetWidth = 0;
  el.offsetHeight = 0;
  el.clientWidth = 0;
  el.clientHeight = 0;
  el.scrollWidth = 0;
  el.scrollHeight = 0;
  return el;
}

function _createDivElement()     { const el = _createGenericElement('div'); el.getElementsByTagName = function(tag) { return tag === 'i' ? { length: 0 } : []; }; return el; }
function _createSpanElement()    { return _createGenericElement('span'); }
function _createScriptElement()  {
  const el = _createGenericElement('script');
  el.src = '';
  el.type = 'text/javascript';
  el.async = false;
  el.defer = false;
  return el;
}
function _createAnchorElement()  {
  const el = _createGenericElement('a');
  el.href = '';
  el.hostname = '';
  el.protocol = '';
  el.pathname = '';
  el.search = '';
  el.hash = '';
  el.port = '';
  return el;
}
function _createImgElement()     {
  const el = _createGenericElement('img');
  el.src = '';
  el.alt = '';
  el.naturalWidth = 0;
  el.naturalHeight = 0;
  el.complete = true;
  return el;
}

function _createAllCollection() {
  const arr = [];
  arr.__proto__ = (function HTMLAllCollection() {}).prototype;
  Object.setPrototypeOf(arr.__proto__, Array.prototype); // 继承 Array 方法
  setNativeTag(arr, 'HTMLAllCollection');
  arr.item = function (i) { return this[i]; };
  arr.namedItem = function (name) { return null; };
  // 填充一些占位元素
  for (let i = 0; i < 5; i++) arr.push(i);
  return arr;
}

// ============================================================================
// 10. WebGL — GPU 指纹（最复杂的维度）
// ============================================================================

/**
 * WebGL 常量映射（浏览器中这些值是通过 C++ 绑定的，这里手动模拟）
 */
const GL_CONSTANTS = {
  VENDOR:                    0x1F00, // 7936
  RENDERER:                  0x1F01, // 7937
  VERSION:                   0x1F02, // 7938
  SHADING_LANGUAGE_VERSION:  0x8B8C, // 35724
  MAX_TEXTURE_SIZE:          0x0D33, // 3379
  MAX_VIEWPORT_DIMS:         0x0D3A, // 3386
  MAX_VERTEX_ATTRIBS:        0x8869, // 34921
  VERTEX_SHADER:             0x8B31, // 35633
  FRAGMENT_SHADER:           0x8B30, // 35632
  ARRAY_BUFFER:              0x8892, // 34962
  STATIC_DRAW:               0x88E4, // 35044
  FLOAT:                     0x1406, // 5126
  TRIANGLE_STRIP:            0x0005, // 5
  RGBA:                      0x1908, // 6408
  UNSIGNED_BYTE:             0x1401, // 5121
  DEPTH_TEST:                0x0B71, // 2929
  LEQUAL:                    0x0203, // 515
  COLOR_BUFFER_BIT:          0x4000, // 16384
  DEPTH_BUFFER_BIT:          0x0100, // 256
};

/**
 * 创建 WebGLRenderingContext 实例
 */
function _createWebGLContext(canvas) {
  const gl = {};
  gl.__proto__ = WebGLRenderingContext.prototype;

  // 静态常量挂载
  Object.keys(GL_CONSTANTS).forEach(k => { gl[k] = GL_CONSTANTS[k]; });

  gl.canvas = canvas;

  // 存储着色器/程序对象（用于编译/链接状态）
  let _shaders = new Map();
  let _programs = new Map();
  let _buffers = new Map();

  return gl;
}

WebGLRenderingContext = function WebGLRenderingContext() {};
const webglProto = WebGLRenderingContext.prototype;

// --- 静态常量 ---
Object.keys(GL_CONSTANTS).forEach(k => {
  webglProto[k] = GL_CONSTANTS[k];
});

// 着色器/属性/uniform 计数器（此前是隐式全局，首次读取即 ReferenceError）
let _webgl_shaderCounter = 0;
let _webgl_attrCounter = 0;
let _webgl_uniformCounter = 0;

Object.assign(webglProto, {
  canvas: null,

  // ---- getParameter — WebGL 指纹核心（优先使用真实数据）----
  getParameter: function (pname) {
    switch (pname) {
      // 使用 FP_CONFIG 真实数据字段（injectRealFingerprint 注入），无则回退默认值
      case GL_CONSTANTS.VENDOR:
        return FP_CONFIG.webglVendorRaw || 'WebKit';
      case GL_CONSTANTS.RENDERER:
        return FP_CONFIG.webglRendererRaw || 'WebKit WebGL';
      case GL_CONSTANTS.VERSION:
        return FP_CONFIG.webglVersionRaw || 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
      case GL_CONSTANTS.SHADING_LANGUAGE_VERSION:
        return FP_CONFIG.webglShadingLangVersionRaw || 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
      case GL_CONSTANTS.MAX_TEXTURE_SIZE:
        return FP_CONFIG.gpuMaxTextureSize;
      case GL_CONSTANTS.MAX_VIEWPORT_DIMS:
        return new Int32Array(FP_CONFIG.gpuMaxViewportDims);
      case GL_CONSTANTS.MAX_VERTEX_ATTRIBS:
        return FP_CONFIG.gpuMaxVertexAttribs;
      // 扩展返回的 Debug 信息
      default: {
        // 检查是否是 DEBUG 扩展的常量
        if (pname === 0x9245) return FP_CONFIG.gpuVendor;   // UNMASKED_VENDOR_WEBGL
        if (pname === 0x9246) return FP_CONFIG.gpuRenderer; // UNMASKED_RENDERER_WEBGL
        return null;
      }
    }
  },

  // ---- getExtension — 返回扩展对象或 null ----
  getExtension: function (name) {
    // WEBGL_debug_renderer_info — 暴露真实 GPU 信息（可配置拦截）
    if (name === 'WEBGL_debug_renderer_info') {
      return {
        UNMASKED_VENDOR_WEBGL:   0x9245,
        UNMASKED_RENDERER_WEBGL: 0x9246
      };
    }
    // EXT_texture_filter_anisotropic
    if (name === 'EXT_texture_filter_anisotropic'
        || name === 'WEBKIT_EXT_texture_filter_anisotropic'
        || name === 'MOZ_EXT_texture_filter_anisotropic') {
      return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF, TEXTURE_MAX_ANISOTROPY_EXT: 16 };
    }
    // WEBGL_lose_context
    if (name === 'WEBGL_lose_context') {
      return { loseContext: function () {}, restoreContext: function () {} };
    }
    // WEBGL_compressed_texture_s3tc
    if (name === 'WEBGL_compressed_texture_s3tc') return {};
    if (name === 'WEBGL_compressed_texture_s3tc_srgb') return {};
    // 不在已知列表中的扩展 → 返回 null（模拟不支持的扩展）
    return FP_CONFIG.webglExtensions.includes(name) ? {} : null;
  },

  // ---- getSupportedExtensions — 返回扩展名列表 ----
  getSupportedExtensions: function () {
    return [...FP_CONFIG.webglExtensions];
  },

  // ---- 着色器相关 ----
  createShader: function (type) {
    const shader = { _type: type, _compiled: false };
    _webgl_shaderCounter = (_webgl_shaderCounter || 0) + 1;
    return shader;
  },
  shaderSource: function (shader, source) {
    shader._source = source;
  },
  compileShader: function (shader) {
    shader._compiled = true;
  },
  getShaderParameter: function (shader, pname) {
    return shader._compiled;
  },
  getShaderInfoLog: function (shader) { return ''; },
  deleteShader: function (shader) {},

  // ---- 程序相关 ----
  createProgram: function () {
    const program = { _linked: false, _shaders: [] };
    return program;
  },
  attachShader: function (program, shader) {
    program._shaders.push(shader);
  },
  linkProgram: function (program) {
    program._linked = true;
  },
  useProgram: function (program) {},
  getProgramParameter: function (program, pname) { return true; },
  getProgramInfoLog: function (program) { return ''; },
  deleteProgram: function (program) {},

  // ---- Attribute / Uniform ----
  getAttribLocation: function (program, name) {
    _webgl_attrCounter = (_webgl_attrCounter || 0) + 1;
    return _webgl_attrCounter;
  },
  getUniformLocation: function (program, name) {
    _webgl_uniformCounter = (_webgl_uniformCounter || 0) + 1;
    return { _uniformIndex: _webgl_uniformCounter };
  },
  enableVertexAttribArray: function (index) {},
  vertexAttribPointer: function (index, size, type, normalized, stride, offset) {},
  uniform1f: function (location, v0) {},
  uniform2f: function (location, x, y) {},
  uniform3f: function (location, x, y, z) {},
  uniform4f: function (location, x, y, z, w) {},
  uniform1i: function (location, v0) {},
  uniformMatrix4fv: function (location, transpose, value) {},
  getActiveAttrib: function (program, index) { return { name: '', size: 1, type: GL_CONSTANTS.FLOAT }; },
  getActiveUniform: function (program, index) { return { name: '', size: 1, type: GL_CONSTANTS.FLOAT }; },
  bindAttribLocation: function (program, index, name) {},

  // ---- Buffer ----
  createBuffer: function () {
    return { _buffer: true };
  },
  bindBuffer: function (target, buffer) {},
  bufferData: function (target, data, usage) {},
  deleteBuffer: function (buffer) {},

  // ---- 渲染 ----
  drawArrays: function (mode, first, count) {},
  drawElements: function (mode, count, type, offset) {},
  readPixels: function (x, y, w, h, format, type, pixels) {
    if (pixels && pixels.length >= 4) {
      // 真实注入优先: webglShaderPixelsRaw = '174,136,255,255'（浏览器报告 webglAdvanced）
      if (FP_CONFIG.webglShaderPixelsRaw) {
        const raw = String(FP_CONFIG.webglShaderPixelsRaw).split(',').map(Number);
        if (raw.length >= 4 && raw.every(n => !Number.isNaN(n))) {
          for (let i = 0; i < 4; i++) pixels[i] = raw[i] & 0xFF;
          return;
        }
      }
      // 回退: 返回基于 GPU 配置的"稳定"像素值（模拟不同 GPU 的微小差异）
      const seed = FP_CONFIG.gpuVendor + FP_CONFIG.gpuRenderer;
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h) + seed.charCodeAt(i);
        h |= 0;
      }
      pixels[0] = Math.abs(h) % 256;           // R
      pixels[1] = Math.abs(h >> 8) % 256;      // G
      pixels[2] = Math.abs(h >> 16) % 256;     // B
      pixels[3] = 255;                          // A
    }
  },

  // ---- 状态管理 ----
  clearColor: function (r, g, b, a) {},
  clear: function (mask) {},
  enable: function (cap) {},
  disable: function (cap) {},
  depthFunc: function (func) {},
  viewport: function (x, y, w, h) {},
  scissor: function (x, y, w, h) {},
  blendFunc: function (sfactor, dfactor) {},
  blendFuncSeparate: function (srcRGB, dstRGB, srcAlpha, dstAlpha) {},
  pixelStorei: function (pname, param) {},
  bindTexture: function (target, texture) {},
  activeTexture: function (texture) {},
  createTexture: function () { return {}; },
  deleteTexture: function (texture) {},
  createFramebuffer: function () { return {}; },
  bindFramebuffer: function (target, framebuffer) {},
  framebufferTexture2D: function (target, attachment, textarget, texture, level) {},
  deleteFramebuffer: function (framebuffer) {},
  createRenderbuffer: function () { return {}; },
  bindRenderbuffer: function (target, renderbuffer) {},
  renderbufferStorage: function (target, internalformat, w, h) {},
  deleteRenderbuffer: function (renderbuffer) {},
  checkFramebufferStatus: function (target) { return 0x8CD5; }, // FRAMEBUFFER_COMPLETE
  getError: function () { return 0; }, // NO_ERROR
  getShaderPrecisionFormat: function (shaderType, precisionType) {
    return { rangeMin: 127, rangeMax: 127, precision: 23 };
  },
  getContextAttributes: function () {
    return { alpha: true, antialias: true, depth: true, failIfMajorPerformanceCaveat: false,
             powerPreference: 'default', premultipliedAlpha: true, preserveDrawingBuffer: false,
             stencil: false, desynchronized: false };
  },
  isContextLost: function () { return false; },
  getRenderbufferParameter: function () { return null; },
  getTexParameter: function () { return null; },
  getVertexAttrib: function () { return null; },
  getVertexAttribOffset: function () { return 0; },

  // 供调试
  toString: function () { return '[object WebGLRenderingContext]'; }
});

// 在 WebGL 原型上挂载常量
for (const [k, v] of Object.entries(GL_CONSTANTS)) {
  defProp(webglProto, k, { value: v });
}

setNativeTag(webglProto, 'WebGLRenderingContext');
updateFunToString(WebGLRenderingContext);

window.WebGLRenderingContext = WebGLRenderingContext;
globalThis.WebGLRenderingContext = WebGLRenderingContext;

// ============================================================================
// 11. Intl — 时区指纹
// ============================================================================

// Node 内置 Intl，但其 resolvedOptions().timeZone 跟随宿主系统时区 ——
// 注入的 FP_CONFIG.timezone 必须强制生效，否则 timezone 与 timezoneOffset 互相矛盾
(function () {
  const OrigDateTimeFormat = globalThis.Intl.DateTimeFormat;
  function PatchedDateTimeFormat(locales, options) {
    const inst = new OrigDateTimeFormat(locales, options);
    const origResolvedOptions = inst.resolvedOptions.bind(inst);
    inst.resolvedOptions = function () {
      const opts = origResolvedOptions();
      opts.timeZone = FP_CONFIG.timezone;
      return opts;
    };
    return inst;
  }
  PatchedDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
  PatchedDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;
  globalThis.Intl.DateTimeFormat = PatchedDateTimeFormat;
  window.Intl = globalThis.Intl;
})();

// 确保 Date.prototype.getTimezoneOffset 返回配置值
const _origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
Date.prototype.getTimezoneOffset = function () {
  return FP_CONFIG.timezoneOffset;
};

// ============================================================================
// 12. Audio — OfflineAudioContext 指纹
// ============================================================================

/**
 * 构建完整的 Audio API 补丁
 *
 * 音频处理管线: OscillatorNode → DynamicsCompressorNode → AudioDestinationNode
 * 渲染后的波形数据通过 oncomplete 回调返回
 */

// AudioParam — 所有音频参数的基础类
AudioParam = function AudioParam() {};
AudioParam.prototype = {
  setValueAtTime:        function (value, time) {},
  linearRampToValueAtTime: function (value, time) {},
  exponentialRampToValueAtTime: function (value, time) {},
  setTargetAtTime:       function (target, startTime, timeConstant) {},
  setValueCurveAtTime:   function (values, startTime, duration) {},
  cancelScheduledValues: function (startTime) {},
  cancelAndHoldAtTime:   function (cancelTime) {},
};
setNativeTag(AudioParam.prototype, 'AudioParam');

// OscillatorNode
OscillatorNode = function OscillatorNode() {};
OscillatorNode.prototype = {
  get type()       { return this._type || 'triangle'; },
  set type(v)      { this._type = v; },
  get frequency()  { return this._frequency || (this._frequency = Object.create(AudioParam.prototype)); },
  get detune()     { return this._detune || (this._detune = Object.create(AudioParam.prototype)); },
  connect:         function (dest) { this._dest = dest; },
  disconnect:      function () {},
  start:           function (when) { this._started = true; },
  stop:            function (when) {},
};
setNativeTag(OscillatorNode.prototype, 'OscillatorNode');

// DynamicsCompressorNode
DynamicsCompressorNode = function DynamicsCompressorNode() {};
DynamicsCompressorNode.prototype = {
  get threshold()  { return this._threshold || (this._threshold = Object.create(AudioParam.prototype)); },
  get knee()       { return this._knee || (this._knee = Object.create(AudioParam.prototype)); },
  get ratio()      { return this._ratio || (this._ratio = Object.create(AudioParam.prototype)); },
  get reduction()  { return this._reduction || (this._reduction = Object.create(AudioParam.prototype)); },
  get attack()     { return this._attack || (this._attack = Object.create(AudioParam.prototype)); },
  get release()    { return this._release || (this._release = Object.create(AudioParam.prototype)); },
  connect:         function (dest) { this._dest = dest; },
  disconnect:      function () {},
};
setNativeTag(DynamicsCompressorNode.prototype, 'DynamicsCompressorNode');

// AudioBuffer — 渲染结果
AudioBuffer = function AudioBuffer() {};
AudioBuffer.prototype = {
  getChannelData: function (channel) {
    // ================================================================
    // 优先使用真实浏览器采集的音频数据
    // ================================================================
    if (FP_CONFIG.audioRawSamples && FP_CONFIG.audioRawSamples.length > 0) {
      // 情况 A: 完整波形（≥5000 个采样点）→ 直接使用
      if (FP_CONFIG.audioRawSamples.length >= 5000) {
        return new Float32Array(FP_CONFIG.audioRawSamples);
      }
      // 情况 B: 稀疏采样点（如 50 个，来自浏览器报告 audio.rawData）
      //   → 先生成合成波形作为底，再在 4500~5000 位置覆盖真实值
      const totalSamples = 5000;
      const samples = [];
      for (let i = 0; i < totalSamples; i++) {
        const val = Math.sin(i * 0.1 + FP_CONFIG.audioSeed * 100) * 0.05
                  + Math.cos(i * 0.07 + FP_CONFIG.audioSeed * 50) * 0.03;
        samples.push(parseFloat(val.toFixed(10)));
      }
      // 将真实采样点覆盖到对应位置（4500, 4510, 4520, ...）
      const startIdx = 4500;
      const step = 10;
      for (let j = 0; j < FP_CONFIG.audioRawSamples.length && (startIdx + j * step) < totalSamples; j++) {
        samples[startIdx + j * step] = FP_CONFIG.audioRawSamples[j];
      }
      return new Float32Array(samples);
    }
    // ================================================================
    // 回退：基于 audioSeed 生成稳定波形
    // ================================================================
    const totalSamples = 5000;
    const samples = [];
    for (let i = 0; i < totalSamples; i++) {
      const val = Math.sin(i * 0.1 + FP_CONFIG.audioSeed * 100) * 0.05
                + Math.cos(i * 0.07 + FP_CONFIG.audioSeed * 50) * 0.03;
      samples.push(parseFloat(val.toFixed(10)));
    }
    return new Float32Array(samples);
  },
  get length()       { return 5000; },
  get duration()     { return 0.5; },
  get sampleRate()   { return 44100; },
  get numberOfChannels() { return 1; },
};
setNativeTag(AudioBuffer.prototype, 'AudioBuffer');

// OfflineAudioContext 构造函数
OfflineAudioContext = function OfflineAudioContext(channels, length, sampleRate) {
  this._channels   = channels || 1;
  this._length     = length || 44100;
  this._sampleRate = sampleRate || 44100;
  this._oncomplete = null;
  this._started    = false;
};

OfflineAudioContext.prototype = {
  get sampleRate() { return this._sampleRate; },
  get length()     { return this._length; },
  get destination() { return this._destination || (this._destination = {}); },
  get currentTime() { return 0; },
  get state()      { return 'running'; },

  get oncomplete()  { return this._oncomplete; },
  set oncomplete(fn){ this._oncomplete = fn; },

  createOscillator: function () {
    const osc = {};
    osc.__proto__ = OscillatorNode.prototype;
    return osc;
  },
  createDynamicsCompressor: function () {
    const comp = {};
    comp.__proto__ = DynamicsCompressorNode.prototype;
    return comp;
  },
  createGain: function () {
    return {
      __proto__: (function GainNode() {}).prototype,
      gain: Object.create(AudioParam.prototype),
      connect: function () {}, disconnect: function () {}
    };
  },
  createBuffer: function (channels, length, sampleRate) {
    return Object.create(AudioBuffer.prototype);
  },
  createBufferSource: function () {
    return {
      __proto__: (function AudioBufferSourceNode() {}).prototype,
      buffer: null, connect: function(){}, disconnect: function(){}, start: function(){}, stop: function(){}
    };
  },
  createBiquadFilter: function () {
    return {
      __proto__: (function BiquadFilterNode() {}).prototype,
      type: 'lowpass', frequency: Object.create(AudioParam.prototype),
      connect: function(){}, disconnect: function(){}
    };
  },
  createAnalyser: function () {
    return { __proto__: (function AnalyserNode() {}).prototype, connect: function(){}, disconnect: function(){} };
  },
  createPanner: function () {
    return { __proto__: (function PannerNode() {}).prototype, connect: function(){}, disconnect: function(){} };
  },
  createStereoPanner: function () {
    return { __proto__: (function StereoPannerNode() {}).prototype, pan: Object.create(AudioParam.prototype), connect: function(){}, disconnect: function(){} };
  },
  createDelay: function () {
    return { __proto__: (function DelayNode() {}).prototype, delayTime: Object.create(AudioParam.prototype), connect: function(){}, disconnect: function(){} };
  },
  createConvolver: function () {
    return { __proto__: (function ConvolverNode() {}).prototype, connect: function(){}, disconnect: function(){} };
  },
  createChannelSplitter: function () { return { connect: function(){}, disconnect: function(){} }; },
  createChannelMerger: function () { return { connect: function(){}, disconnect: function(){} }; },
  createWaveShaper: function () {
    return { __proto__: (function WaveShaperNode() {}).prototype, connect: function(){}, disconnect: function(){} };
  },
  createPeriodicWave: function (real, imag, constraints) { return {}; },
  createMediaStreamSource: function () { return { connect: function(){} }; },
  createMediaStreamDestination: function () { return { stream: {} }; },
  createScriptProcessor: function (bufferSize, numberOfInputChannels, numberOfOutputChannels) {
    return {
      __proto__: (function ScriptProcessorNode() {}).prototype,
      connect: function(){}, disconnect: function(){},
      set onaudioprocess(fn) { this._onaudioprocess = fn; }
    };
  },

  // startRendering — 核心方法，返回 Promise<AudioBuffer>
  startRendering: function () {
    const self = this;
    return new Promise(function (resolve) {
      // 模拟异步渲染完成（真实浏览器是真正的异步音频处理）
      setTimeout(function () {
        const buffer = Object.create(AudioBuffer.prototype);
        // 触发 oncomplete 回调
        if (self._oncomplete) {
          const event = {
            renderedBuffer: buffer
          };
          self._oncomplete(event);
        }
        resolve(buffer);
      });
    });
  },

  // resume / suspend / close
  resume:  function () { return Promise.resolve(); },
  suspend: function (time) { return Promise.resolve(); },
  close:   function () { return Promise.resolve(); },

  toString: function () { return '[object OfflineAudioContext]'; }
};

setNativeTag(OfflineAudioContext.prototype, 'OfflineAudioContext');
updateFunToString(OfflineAudioContext);

// 挂载到全局
window.OfflineAudioContext = OfflineAudioContext;
window.webkitOfflineAudioContext = OfflineAudioContext;
window.AudioContext = OfflineAudioContext; // 在线 AudioContext 也指向离线版
window.webkitAudioContext = OfflineAudioContext;
window.AudioBuffer = AudioBuffer;
window.AudioParam = AudioParam;
window.OscillatorNode = OscillatorNode;
window.DynamicsCompressorNode = DynamicsCompressorNode;

globalThis.OfflineAudioContext = OfflineAudioContext;
globalThis.webkitOfflineAudioContext = OfflineAudioContext;

// ============================================================================
// 13. 其他 Web API 补丁
// ============================================================================

// performance
window.performance = globalThis.performance || {
  now: function () { return Date.now() - _loadTime; },
  timing: { navigationStart: _loadTime, loadEventEnd: _loadTime + 500 },
  getEntries: function () { return []; },
  getEntriesByType: function (type) { return []; },
  getEntriesByName: function (name) { return []; },
  mark: function (name) {},
  measure: function (name, startMark, endMark) {},
  clearMarks: function (name) {},
  clearMeasures: function (name) {},
  memory: { usedJSHeapSize: 50 * 1024 * 1024, totalJSHeapSize: 100 * 1024 * 1024, jsHeapSizeLimit: 2 * 1024 * 1024 * 1024 }
};
const _loadTime = Date.now() - 1000;

// XMLHttpRequest
XMLHttpRequest = function XMLHttpRequest() {};
XMLHttpRequest.prototype = {
  UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
  readyState: 0, status: 0, statusText: '', responseText: '', responseXML: null,
  open:     function (method, url) {},
  send:     function (body) {},
  abort:    function () {},
  setRequestHeader: function (name, value) {},
  getResponseHeader: function (name) { return null; },
  getAllResponseHeaders: function () { return ''; },
  overrideMimeType: function (mime) {},
  addEventListener: function (type, listener) {},
  get onreadystatechange() { return null; },
  set onreadystatechange(v) {},
};
setNativeTag(XMLHttpRequest.prototype, 'XMLHttpRequest');
updateFunToString(XMLHttpRequest);
window.XMLHttpRequest = XMLHttpRequest;

// DOMParser
DOMParser = function DOMParser() {};
DOMParser.prototype = {
  parseFromString: function (str, type) {
    return {
      documentElement: _createGenericElement('parsererror'),
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementsByTagName: function () { return []; }
    };
  }
};
setNativeTag(DOMParser.prototype, 'DOMParser');
updateFunToString(DOMParser);
window.DOMParser = DOMParser;

// MutationObserver
MutationObserver = function MutationObserver(callback) { this._callback = callback; };
MutationObserver.prototype = {
  observe:   function (target, options) {},
  disconnect: function () {},
  takeRecords: function () { return []; }
};
setNativeTag(MutationObserver.prototype, 'MutationObserver');
updateFunToString(MutationObserver);
window.MutationObserver = MutationObserver;

// atob / btoa（确保可用）
if (!window.atob) window.atob = (s) => Buffer.from(s, 'base64').toString('binary');
if (!window.btoa) window.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

// ============================================================================
// 14. HTML 元素构造函数（供 instanceof 检测）
// ============================================================================

[
  'HTMLElement','HTMLDivElement','HTMLSpanElement','HTMLScriptElement',
  'HTMLHeadElement',/* HTMLCanvasElement defined above */'HTMLMetaElement','HTMLAnchorElement',
  'HTMLBodyElement','HTMLHtmlElement','HTMLFormElement','HTMLInputElement',
  'HTMLButtonElement','HTMLImageElement','HTMLLinkElement','HTMLStyleElement',
  'HTMLParagraphElement','HTMLSelectElement','HTMLOptionElement','HTMLTextAreaElement',
  'HTMLTableElement','HTMLTableRowElement','HTMLTableCellElement',
  'HTMLUListElement','HTMLLIElement','HTMLIFrameElement','HTMLVideoElement',
  'HTMLAudioElement','HTMLTemplateElement','HTMLSlotElement','HTMLUnknownElement'
].forEach(function (clsName) {
  const Fn = function () {};
  updateFunToString(Fn);
  window[clsName] = Fn;
  globalThis[clsName] = Fn;
});

// Event — 构造函数参数存入 _type，getter 读取（此前赋给 getter-only 的 type 被静默丢弃）
Event = function Event(type) { this._type = type; };
Event.prototype = {
  get type()          { return this._type; },
  get target()        { return null; },
  get currentTarget() { return null; },
  get eventPhase()    { return 0; },
  get bubbles()       { return false; },
  get cancelable()    { return false; },
  get defaultPrevented() { return false; },
  preventDefault:  function () {},
  stopPropagation: function () {},
  stopImmediatePropagation: function () {}
};
setNativeTag(Event.prototype, 'Event');
updateFunToString(Event);
window.Event = Event;

// ============================================================================
// 15. 导出接口
// ============================================================================

module.exports = {
  // 配置管理
  FP_CONFIG,
  setFingerprintConfig,
  injectRealFingerprint,

  // 工具
  updateFunToString,
  setNativeTag,
  defProp,

  // 构造函数（供外部扩展）
  Window,
  Navigator,
  Screen,
  Location,
  History,
  Document,
  HTMLCanvasElement,
  CanvasRenderingContext2D,
  WebGLRenderingContext,
  OfflineAudioContext,

  // 预设指纹配置（可快速切换常见设备）
  PRESETS: {
    'windows-chrome': {
      userAgent:   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      platform:    'Win32',
      gpuVendor:   'Google Inc. (Intel)',
      gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      hardwareConcurrency: 16,
      deviceMemory: 8,
    },
    'macos-chrome': {
      userAgent:   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      platform:    'MacIntel',
      gpuVendor:   'Google Inc. (Apple)',
      gpuRenderer: 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
      hardwareConcurrency: 12,
      deviceMemory: 16,
    },
    'linux-chrome': {
      userAgent:   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      platform:    'Linux x86_64',
      gpuVendor:   'Google Inc. (NVIDIA)',
      gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      hardwareConcurrency: 8,
      deviceMemory: 32,
    },
    'ios-safari': {
      userAgent:   'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform:    'iPhone',
      gpuVendor:   'Apple Inc.',
      gpuRenderer: 'Apple A17 Pro GPU',
      hardwareConcurrency: 6,
      deviceMemory: 8,
    },
  },

  /**
   * 快速应用预设
   * @param {string} presetName - 预设名称
   * @example applyPreset('windows-chrome')
   */
  applyPreset(presetName) {
    const preset = module.exports.PRESETS[presetName];
    if (preset) {
      setFingerprintConfig(preset);
      console.log(`[fp_env_patch] Applied preset: ${presetName}`);
    } else {
      console.error(`[fp_env_patch] Unknown preset: ${presetName}`);
      console.log(`Available: ${Object.keys(module.exports.PRESETS).join(', ')}`);
    }
  }
};

console.log('[fp_env_patch] Browser fingerprint environment patched successfully.');
console.log('[fp_env_patch] GPU: ' + FP_CONFIG.gpuVendor + ' / ' + FP_CONFIG.gpuRenderer);
console.log('[fp_env_patch] Use setFingerprintConfig({...}) to customize fingerprint values.');
