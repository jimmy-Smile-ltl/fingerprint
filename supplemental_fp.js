/**
 * supplemental_fp.js — browser-only supplemental fingerprint collectors.
 *
 * These signals are intentionally kept OUT of all_fp.js and the core
 * visitorId: they are high-entropy, asynchronous, permission-sensitive, or
 * unstable across browsers, and including them would break the existing
 * browser ↔ Node parity demo. The page displays them as separate dimensions.
 *
 * Every collector is defensive: unsupported APIs return `{ available: false }`
 * instead of throwing, and slow APIs are bounded with a timeout.
 */

import md5 from 'blueimp-md5';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    sleep(ms).then(() => fallback)
  ]);
}

function safe(value, fallback = null) {
  try {
    return typeof value === 'function' ? value() : value;
  } catch (error) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. User-Agent Client Hints
// ---------------------------------------------------------------------------
async function collectClientHints() {
  const uaData = navigator.userAgentData;
  if (!uaData) return { available: false };
  const hints = await withTimeout(
    uaData.getHighEntropyValues([
      'architecture', 'bitness', 'model', 'platformVersion',
      'uaFullVersion', 'fullVersionList', 'wow64'
    ]),
    1200,
    {}
  );
  return {
    available: true,
    brands: (uaData.brands || []).map((b) => `${b.brand}/${b.version}`).join(', '),
    mobile: uaData.mobile,
    platform: uaData.platform,
    architecture: hints.architecture || null,
    bitness: hints.bitness || null,
    model: hints.model || null,
    platformVersion: hints.platformVersion || null,
    uaFullVersion: hints.uaFullVersion || null,
    wow64: hints.wow64 ?? null,
    fullVersionList: (hints.fullVersionList || []).slice(0, 8).map((b) => `${b.brand}/${b.version}`)
  };
}

// ---------------------------------------------------------------------------
// 2. WebGL2
// ---------------------------------------------------------------------------
function collectWebGL2() {
  const canvas = document.createElement('canvas');
  let gl = null;
  try {
    gl = canvas.getContext('webgl2');
  } catch (error) {
    return { available: false, error: error.message };
  }
  if (!gl) return { available: false };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    available: true,
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    max3DTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
    maxArrayTextureLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
    maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES),
    extensionCount: (gl.getSupportedExtensions() || []).length
  };
}

// ---------------------------------------------------------------------------
// 3. WebGPU
// ---------------------------------------------------------------------------
async function collectWebGPU() {
  if (!navigator.gpu || !navigator.gpu.requestAdapter) return { available: false };
  const adapter = await withTimeout(navigator.gpu.requestAdapter(), 1800, null);
  if (!adapter) return { available: true, adapter: false };
  const info = adapter.info || {};
  const features = Array.from(adapter.features || []);
  const limits = adapter.limits || {};
  return {
    available: true,
    adapter: true,
    vendor: info.vendor || null,
    architecture: info.architecture || null,
    device: info.device || null,
    description: info.description || null,
    featureCount: features.length,
    features: features.slice(0, 16),
    maxTextureDimension2D: limits.maxTextureDimension2D ?? null,
    maxBufferSize: limits.maxBufferSize ?? null,
    maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX ?? null,
    maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup ?? null
  };
}

// ---------------------------------------------------------------------------
// 4. WebRTC ICE candidates
// ---------------------------------------------------------------------------
async function collectWebRTC(timeoutMs = 1600) {
  const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!RTC) return { available: false };
  let pc = null;
  try {
    pc = new RTC({ iceServers: [] });
    const candidates = [];
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push({
          candidate: event.candidate.candidate,
          type: event.candidate.type || null,
          protocol: event.candidate.protocol || null,
          address: event.candidate.address || null,
          port: event.candidate.port || null
        });
      }
    };
    pc.createDataChannel('fingerprint');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) { done = true; resolve(); }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      setTimeout(finish, timeoutMs);
    });
    const types = {};
    for (const c of candidates) {
      const key = c.type || 'unknown';
      types[key] = (types[key] || 0) + 1;
    }
    return {
      available: true,
      count: candidates.length,
      types,
      candidates: candidates.slice(0, 8).map((c) => ({
        type: c.type,
        protocol: c.protocol,
        address: c.address,
        port: c.port
      }))
    };
  } catch (error) {
    return { available: true, count: 0, error: error.message };
  } finally {
    if (pc) try { pc.close(); } catch (error) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 5. Media devices
// ---------------------------------------------------------------------------
async function collectMediaDevices() {
  const md = navigator.mediaDevices;
  if (!md || !md.enumerateDevices) return { available: false };
  const devices = await withTimeout(md.enumerateDevices(), 1400, null);
  if (!devices) return { available: true, devices: null };
  const counts = {};
  for (const device of devices) counts[device.kind] = (counts[device.kind] || 0) + 1;
  const labels = devices.map((d) => d.label).filter(Boolean);
  return {
    available: true,
    total: devices.length,
    counts,
    labelCount: labels.length,
    labels: labels.slice(0, 8)
  };
}

// ---------------------------------------------------------------------------
// 6. Speech synthesis voices
// ---------------------------------------------------------------------------
async function collectSpeech() {
  if (!window.speechSynthesis) return { available: false };
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      if (speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      } else {
        speechSynthesis.onvoiceschanged = finish;
      }
      setTimeout(finish, 900);
    });
    voices = speechSynthesis.getVoices();
  }
  const languages = [...new Set(voices.map((v) => v.lang))];
  return {
    available: true,
    count: voices.length,
    localCount: voices.filter((v) => v.localService).length,
    languages: languages.slice(0, 20),
    sample: voices.slice(0, 8).map((v) => v.name)
  };
}

// ---------------------------------------------------------------------------
// 7. Permissions, storage
// ---------------------------------------------------------------------------
async function collectPermissionsStorage() {
  const permissionNames = [
    'geolocation', 'notifications', 'camera', 'microphone',
    'clipboard-read', 'clipboard-write', 'midi',
    'accelerometer', 'gyroscope', 'magnetometer'
  ];
  const permissions = {};
  if (navigator.permissions && navigator.permissions.query) {
    await Promise.all(permissionNames.map(async (name) => {
      try {
        const status = await withTimeout(navigator.permissions.query({ name }), 400, null);
        if (status) permissions[name] = status.state;
      } catch (error) { /* unsupported name */ }
    }));
  }
  const estimate = navigator.storage && navigator.storage.estimate
    ? await withTimeout(navigator.storage.estimate(), 800, null)
    : null;
  const storageCheck = (name) => {
    try {
      const storage = window[name];
      const key = '__fp_probe__';
      storage.setItem(key, '1');
      storage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  };
  return {
    available: true,
    permissions,
    cookieEnabled: navigator.cookieEnabled,
    localStorage: storageCheck('localStorage'),
    sessionStorage: storageCheck('sessionStorage'),
    indexedDB: !!window.indexedDB,
    quota: estimate ? estimate.quota : null,
    usage: estimate ? estimate.usage : null
  };
}

// ---------------------------------------------------------------------------
// 8. Battery, sensors, gamepads
// ---------------------------------------------------------------------------
async function collectBatterySensors() {
  const ua = navigator.userAgent || '';
  const chromium = /Chrome\//.test(ua) || /Edg\//.test(ua);
  const apiAvailable = typeof navigator.getBattery === 'function';
  let battery = null;
  let batteryError = null;
  if (apiAvailable) {
    try {
      const b = await withTimeout(navigator.getBattery(), 900, null);
      if (b) {
        const level = b.level;
        const chargingTime = b.chargingTime;
        const dischargingTime = b.dischargingTime;
        const levelValid = Number.isFinite(level) && level >= 0 && level <= 1;
        const chargingTimeValid = chargingTime === Infinity ||
          (Number.isFinite(chargingTime) && chargingTime >= 0);
        const dischargingTimeValid = dischargingTime === Infinity ||
          (Number.isFinite(dischargingTime) && dischargingTime >= 0);
        battery = {
          charging: b.charging,
          level: levelValid ? Math.round(level * 100) / 100 : level,
          levelText: levelValid ? (Math.round(level * 100) + '%') : String(level),
          chargingTime: chargingTime,
          chargingTimeText: chargingTime === Infinity ? '∞' : (chargingTime + ' s'),
          dischargingTime: dischargingTime,
          dischargingTimeText: dischargingTime === Infinity ? '∞' : (dischargingTime + ' s'),
          levelValid,
          chargingTimeValid,
          dischargingTimeValid,
          invalid: !levelValid || !chargingTimeValid || !dischargingTimeValid,
          // The "plugged in, full, no discharge estimate" pattern is common on
          // desktops but is also the default returned by many VMs/headless envs.
          defaultPattern: b.charging === true && level === 1 &&
            chargingTime === 0 && dischargingTime === Infinity
        };
      }
    } catch (error) {
      batteryError = error.message;
    }
  }
  const sensorNames = [
    'Accelerometer', 'Gyroscope', 'Magnetometer', 'AmbientLightSensor',
    'LinearAccelerationSensor', 'AbsoluteOrientationSensor',
    'RelativeOrientationSensor', 'GravitySensor'
  ];
  const sensors = {};
  for (const name of sensorNames) sensors[name] = name in window;
  const gamepads = navigator.getGamepads
    ? Array.from(navigator.getGamepads()).filter(Boolean).length
    : null;
  return {
    available: true,
    chromium,
    apiAvailable,
    batteryError,
    battery,
    sensors,
    gamepads,
    maxTouchPoints: navigator.maxTouchPoints ?? null
  };
}

// ---------------------------------------------------------------------------
// 9. Codecs and DRM
// ---------------------------------------------------------------------------
async function checkKeySystem(keySystem) {
  if (!navigator.requestMediaKeySystemAccess) return false;
  try {
    const access = await withTimeout(
      navigator.requestMediaKeySystemAccess(keySystem, [{
        initDataTypes: ['cenc'],
        audioCapabilities: [{
          contentType: 'audio/mp4; codecs="mp4a.40.2"',
          robustness: 'SW_SECURE_CRYPTO'
        }],
        videoCapabilities: [{
          contentType: 'video/mp4; codecs="avc1.42E01E"',
          robustness: 'SW_SECURE_CRYPTO'
        }]
      }]),
      1600,
      null
    );
    return !!access;
  } catch (error) {
    return false;
  }
}

async function collectCodecsDrm() {
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  const videoTests = {
    'mp4/h264': 'video/mp4; codecs="avc1.42E01E"',
    'mp4/hevc': 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    'webm/vp9': 'video/webm; codecs="vp9"',
    'webm/av1': 'video/webm; codecs="av01.0.05M.08"'
  };
  const audioTests = {
    'mp3': 'audio/mpeg',
    'aac': 'audio/mp4; codecs="mp4a.40.2"',
    'ogg/opus': 'audio/ogg; codecs="opus"',
    'flac': 'audio/flac'
  };
  const videoSupport = {};
  const audioSupport = {};
  for (const [name, type] of Object.entries(videoTests)) videoSupport[name] = video.canPlayType(type) || 'no';
  for (const [name, type] of Object.entries(audioTests)) audioSupport[name] = audio.canPlayType(type) || 'no';
  const [widevine, playready] = await Promise.all([
    checkKeySystem('com.widevine.alpha'),
    checkKeySystem('com.microsoft.playready')
  ]);
  return {
    available: true,
    video: videoSupport,
    audio: audioSupport,
    eme: !!navigator.requestMediaKeySystemAccess,
    widevine,
    playready
  };
}

// ---------------------------------------------------------------------------
// 10. CSS / DOM media features
// ---------------------------------------------------------------------------
function collectCssDom() {
  const queries = {
    'prefers-color-scheme: dark': 'dark',
    'prefers-color-scheme: light': 'light',
    'prefers-reduced-motion': 'reduce',
    'prefers-contrast: more': 'more',
    'forced-colors: active': 'active',
    'color-gamut: p3': 'p3',
    'color-gamut: rec2020': 'rec2020',
    'pointer: fine': 'fine',
    'pointer: coarse': 'coarse',
    'hover: hover': 'hover',
    'any-pointer: coarse': 'coarse',
    'display-mode: standalone': 'standalone',
    'dynamic-range: high': 'high'
  };
  const media = {};
  for (const [query, label] of Object.entries(queries)) {
    try { media[label] = matchMedia(`(${query})`).matches; } catch (error) { media[label] = null; }
  }
  const supports = {};
  const tests = [
    'display:grid', 'gap:1px', 'backdrop-filter:blur(1px)',
    'container-type:inline-size', 'color:color(display-p3 1 0 0)',
    'text-wrap:balance', 'scrollbar-gutter:stable', 'selector(:has(*))'
  ];
  for (const test of tests) {
    try { supports[test] = CSS.supports(test); } catch (error) { supports[test] = null; }
  }
  return {
    available: true,
    media,
    supports,
    dpr: window.devicePixelRatio,
    screen: `${screen.width}×${screen.height}`,
    avail: `${screen.availWidth}×${screen.availHeight}`,
    colorDepth: screen.colorDepth
  };
}

// ---------------------------------------------------------------------------
// 11. JS engine quirks
// ---------------------------------------------------------------------------
function collectJsEngine() {
  const round = (n) => Math.round(n * 1e12) / 1e12;
  const math = {
    'tan(-1e300)': round(Math.tan(-1e300)),
    'sinh(1)': round(Math.sinh(1)),
    'expm1(1)': round(Math.expm1(1)),
    'log1p(1e-10)': round(Math.log1p(1e-10)),
    'atan2(0,-0)': Math.atan2(0, -0),
    'pow(-0,0.5)': Math.pow(-0, 0.5)
  };
  let intl = {};
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    intl = {
      locale: options.locale,
      calendar: options.calendar,
      numberingSystem: options.numberingSystem,
      hourCycle: options.hourCycle,
      timeZone: options.timeZone
    };
  } catch (error) { /* ignore */ }
  let errorStack = null;
  try { throw new Error('fp'); } catch (error) { errorStack = (error.stack || '').split('\n')[0]; }
  return {
    available: true,
    math,
    intl,
    errorStack,
    nativeMax: Function.prototype.toString.call(Math.max),
    dateString: new Date(0).toString()
  };
}

// ---------------------------------------------------------------------------
// 12. Automation markers
// ---------------------------------------------------------------------------
function collectAutomation() {
  const markers = [
    '__nightmare', 'callPhantom', '_phantom', 'domAutomation',
    'domAutomationController', '__webdriver_evaluate', '__selenium_evaluate',
    '__driver_evaluate', '__webdriver_script_func', '__fxdriver_evaluate',
    '_Selenium_IDE_Recorder', 'cdc_adoQpoasnfa76pfcZLmcfl_Array'
  ];
  const found = markers.filter((key) => key in window);
  const cdc = Object.keys(document).filter((key) => key.startsWith('$cdc_') || key.startsWith('cdc_'));
  const ua = navigator.userAgent || '';
  const chromium = /Chrome\//.test(ua) || /Edg\//.test(ua);
  const webdriver = navigator.webdriver === true;
  const headlessUA = /HeadlessChrome/i.test(ua);
  const chromeObject = !!window.chrome;
  const pluginCount = navigator.plugins ? navigator.plugins.length : null;
  const languageCount = Array.isArray(navigator.languages) ? navigator.languages.length : null;
  const sizeAnomaly = !(window.outerWidth > 0 && window.innerWidth > 0 && window.outerWidth >= window.innerWidth);
  let webglRenderer = null;
  let softwareRenderer = null;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      webglRenderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      softwareRenderer = /SwiftShader|llvmpipe|Software|Basic Render/i.test(webglRenderer || '');
    }
  } catch (error) { /* ignore */ }

  // 强信号：明确的自动化/注入痕迹。弱信号：浏览器能力、窗口状态与渲染路径差异。
  const issues = [];
  const warnings = [];
  if (webdriver) issues.push('navigator.webdriver=true');
  if (headlessUA) issues.push('Headless UA');
  if (found.length) issues.push('注入标记');
  if (cdc.length) issues.push('CDC 标记');
  if (softwareRenderer) warnings.push('软件渲染');
  if (chromium && !chromeObject) warnings.push('缺少 window.chrome');
  if (chromium && pluginCount === 0) warnings.push('插件数量为 0');
  if (!languageCount) warnings.push('语言列表为空');
  // outer/inner 受页面缩放、DPI、全屏与 DevTools 影响，不同浏览器坐标系也不一致，
  // 不适合作为自动化判定；仅保留数值展示，不进入 issues/warnings。

  return {
    available: true,
    webdriver,
    headlessUA,
    chromium,
    chromeObject,
    pluginCount,
    languageCount,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'N/A',
    markers: found,
    cdcMarkers: cdc.slice(0, 5),
    windowSize: `${window.outerWidth}×${window.outerHeight} / ${window.innerWidth}×${window.innerHeight}`,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    sizeAnomaly,
    webglRenderer,
    softwareRenderer,
    hasFocus: document.hasFocus ? document.hasFocus() : null,
    issues,
    issueCount: issues.length,
    warnings,
    warningCount: warnings.length
  };
}

// ---------------------------------------------------------------------------
// 13. Legacy plugins / MIME types
// ---------------------------------------------------------------------------
function collectPlugins() {
  const plugins = [];
  const mimeTypes = [];
  try {
    const list = navigator.plugins || [];
    for (let i = 0; i < list.length; i++) {
      const plugin = list[i];
      if (!plugin) continue;
      const types = [];
      for (let j = 0; j < plugin.length; j++) {
        if (plugin[j] && plugin[j].type) types.push(plugin[j].type);
      }
      plugins.push({
        name: plugin.name || '',
        filename: plugin.filename || '',
        description: plugin.description || '',
        version: plugin.version || '',
        mimeTypes: types
      });
    }
  } catch (error) { /* ignore */ }
  try {
    const list = navigator.mimeTypes || [];
    for (let i = 0; i < list.length; i++) {
      const mime = list[i];
      if (!mime) continue;
      mimeTypes.push({
        type: mime.type || '',
        suffixes: mime.suffixes || '',
        description: mime.description || '',
        plugin: mime.enabledPlugin && mime.enabledPlugin.name || ''
      });
    }
  } catch (error) { /* ignore */ }
  const allPdf = plugins.length > 0 && plugins.every(function(plugin) {
    return /pdf/i.test(plugin.name + ' ' + plugin.description + ' ' + plugin.filename);
  });
  const fingerprint = (plugins.length || mimeTypes.length)
    ? md5(JSON.stringify({
      plugins: plugins.map(function(plugin) {
        return [plugin.name, plugin.filename, plugin.description, plugin.mimeTypes];
      }),
      mimeTypes: mimeTypes.map(function(mime) { return mime.type; })
    }))
    : null;
  return {
    available: true,
    plugins,
    mimeTypes,
    pluginCount: plugins.length,
    mimeCount: mimeTypes.length,
    allPdf,
    fingerprint,
    pdfViewerEnabled: typeof navigator.pdfViewerEnabled === 'boolean' ? navigator.pdfViewerEnabled : null,
    // Browser extensions are intentionally not enumerable from a web page.
    extensionEnumeration: 'unavailable'
  };
}

// ---------------------------------------------------------------------------
// 14. Expanded font list
// ---------------------------------------------------------------------------

// 默认字体度量：不判断"装了哪些字体"，而是测量系统默认字体族的渲染宽度。
// 与已安装字体列表互补——字体列表可被 user-agent 样式表/字号设置影响，宽度更接近排版栈本身。
// 参考 FingerprintJS 的 fontPreferences 源；这里省略了它用于 Android 系统字体的 iframe 方案。
function measureFontPreferences() {
  if (!document.body) return null;
  const sample = 'mmMwWLliI0fiflO&1';
  const families = { serif: 'serif', sans: 'sans-serif', mono: 'monospace', system: 'system-ui' };
  const ua = navigator.userAgent || '';
  const major = Number((ua.match(/Chrome\/(\d+)/) || [])[1] || 0);
  // Chromium 128+ 会把页面缩放算进布局宽度，乘回 devicePixelRatio 抵消；其他引擎不做这件事。
  const normalize = major >= 128;
  const dpr = window.devicePixelRatio || 1;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;';
  document.body.appendChild(host);
  const out = {};
  try {
    const spans = {};
    for (const [key, family] of Object.entries(families)) {
      const span = document.createElement('span');
      span.textContent = sample;
      span.style.cssText = 'font-size:16px;font-weight:400;white-space:nowrap;';
      span.style.fontFamily = family;
      host.appendChild(span);
      spans[key] = span;
    }
    for (const [key, span] of Object.entries(spans)) {
      const width = span.getBoundingClientRect().width * (normalize ? dpr : 1);
      out[key] = Math.floor(width * 1000) / 1000;
    }
  } finally {
    host.remove();
  }
  return out;
}

function collectFontsExpanded() {
  const candidates = [
    // Windows
    'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math',
    'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
    'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact',
    'Ink Free', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic',
    'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft YaHei', 'MS Gothic',
    'MV Boli', 'Nirmala UI', 'Palatino Linotype', 'Segoe Print', 'Segoe Script',
    'Segoe UI', 'SimSun', 'Sitka', 'Sylfaen', 'Tahoma', 'Times New Roman',
    'Trebuchet MS', 'Verdana', 'Yu Gothic',
    // macOS
    'American Typewriter', 'Andale Mono', 'Avenir', 'Avenir Next', 'Baskerville',
    'Big Caslon', 'Brush Script MT', 'Chalkboard', 'Cochin', 'Copperplate',
    'Didot', 'Futura', 'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue',
    'Herculanum', 'Hoefler Text', 'Lucida Grande', 'Luminari', 'Menlo',
    'Monaco', 'Optima', 'Papyrus', 'Phosphate', 'Rockwell', 'Savoye LET',
    'Skia', 'Snell Roundhand', 'Trattatello',
    // Linux / Office / Adobe
    'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Liberation Sans',
    'Liberation Serif', 'Liberation Mono', 'Noto Sans', 'Noto Serif',
    'Noto Sans CJK SC', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Fira Code',
    'Source Han Sans SC', 'Wingdings', 'Webdings', 'Symbol', 'Marlett',
    'Bookshelf Symbol 7', 'MS Reference Sans Serif', 'Adobe Garamond Pro',
    'Adobe Caslon Pro', 'Minion Pro', 'Myriad Pro', 'Trajan Pro'
  ];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const probe = 'mmmmmmmmlli';
  const base = 'monospace';
  ctx.font = `72px ${base}`;
  const baseWidth = ctx.measureText(probe).width;
  const installed = [];
  for (const font of candidates) {
    ctx.font = `72px "${font}", ${base}`;
    if (ctx.measureText(probe).width !== baseWidth) installed.push(font);
  }
  return {
    available: true,
    candidateCount: candidates.length,
    installedCount: installed.length,
    installed,
    preferences: measureFontPreferences()
  };
}

// ---------------------------------------------------------------------------
// 14. Extra Canvas renders
// ---------------------------------------------------------------------------
function canvasHash(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const data1 = canvas.toDataURL();
  const data2 = canvas.toDataURL();
  return { hash: md5(data1), stable: data1 === data2 };
}

function collectCanvasExtra() {
  const text = canvasHash((ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 320, 90);
    gradient.addColorStop(0, '#f60');
    gradient.addColorStop(1, '#069');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 90);
    ctx.font = '20px "Times New Roman"';
    ctx.fillStyle = 'rgba(0,0,0,.8)';
    ctx.fillText('Fingerprint Lab 😃 fjord', 8, 34);
    ctx.font = '16px Georgia';
    ctx.fillText('Cwm fjordbank glyphs vext quiz', 8, 60);
  });
  const shapes = canvasHash((ctx) => {
    ctx.globalCompositeOperation = 'multiply';
    for (const [color, x] of [['rgb(255,0,255)', 70], ['rgb(0,255,255)', 130], ['rgb(255,255,0)', 100]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, 45, 34, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '18px Arial';
    ctx.fillStyle = '#111';
    ctx.fillText('evenodd / winding', 8, 82);
  });
  const metrics = (() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const out = {};
    for (const font of ['12px Arial', '14px Georgia', '16px "Times New Roman"', '18px monospace']) {
      ctx.font = font;
      out[font] = Math.round(ctx.measureText('mmmmmmmmlli').width * 1000) / 1000;
    }
    return out;
  })();
  return { available: true, text, shapes, metrics };
}

// ---------------------------------------------------------------------------
// 16. Screen frame, browser brand, audio latency
// ---------------------------------------------------------------------------
function collectEnvDetails() {
  const s = window.screen || {};
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const width = num(s.width);
  const height = num(s.height);
  const availWidth = num(s.availWidth);
  const availHeight = num(s.availHeight);
  const availTop = num(s.availTop);
  const availLeft = num(s.availLeft);
  // 屏幕边框 = 保留给任务栏 / 菜单栏 / Dock 的区域。部分浏览器无论实际布局都返回 0，
  // 所以这里只做原始读数与推导，不把它当作"异常"。
  const edges = {
    top: availTop,
    left: availLeft,
    right: (width != null && availWidth != null && availLeft != null) ? Math.max(0, width - availWidth - availLeft) : null,
    bottom: (height != null && availHeight != null && availTop != null) ? Math.max(0, height - availHeight - availTop) : null
  };
  const orientation = s.orientation
    ? { type: s.orientation.type, angle: s.orientation.angle }
    : null;
  const isExtended = typeof s.isExtended === 'boolean' ? s.isExtended : null;

  // 同一内核的不同浏览器品牌会挂上各自的全局对象；UA 可以伪造，这些全局变量更容易露馅。
  const flavorKeys = [
    'chrome', 'safari', '__crWeb', '__gCrWeb', 'yandex', '__yb', '__ybro',
    '__firefox__', '__edgeTrackingPreventionStatistics', 'webkit', 'oprt',
    'samsungAr', 'ucweb', 'UCShellJava', 'puffinDevice'
  ];
  const flavors = flavorKeys.filter((key) => {
    const value = window[key];
    return value && typeof value === 'object';
  });

  const ua = navigator.userAgent || '';
  const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isWebKit = !isChromium && !isFirefox && (/Safari\//.test(ua) || /iPhone|iPad|iPod/.test(ua));
  let baseLatency = null;
  let latencyNote = '';
  if (!window.AudioContext) {
    latencyNote = '浏览器不支持 AudioContext';
  } else if (!isWebKit) {
    // 桌面 Chrome/Firefox 创建一个没有用户手势的 AudioContext 会在控制台留下自动播放告警，
    // FingerprintJS 也因此只在 WebKit/Android 上采集这个值。
    latencyNote = 'Chrome/Firefox 会输出自动播放告警，本页不读取';
  } else {
    try {
      const context = new AudioContext();
      baseLatency = typeof context.baseLatency === 'number' ? context.baseLatency : null;
      if (context.close) context.close();
    } catch (error) {
      latencyNote = '读取失败：' + error.message;
    }
  }

  return {
    available: true,
    screen: {
      width, height, availWidth, availHeight, availTop, availLeft,
      colorDepth: num(s.colorDepth), pixelDepth: num(s.pixelDepth)
    },
    edges,
    orientation,
    isExtended,
    flavors,
    baseLatency,
    latencyNote
  };
}

// ---------------------------------------------------------------------------
// 17. Content blockers (ad / tracker filters)
// ---------------------------------------------------------------------------
// 诱饵节点使用 EasyList 一类的常见广告选择器；被内容拦截器隐藏时 offsetParent 为空。
// 这是"站点能看到你在用什么拦截器"的那一面，和 UA/WebGL 一样属于环境画像。
const BLOCKER_SELECTORS = [
  '#ad', '#ads', '#adsbygoogle', '#ad-wrapper',
  '.ad', '.ads', '.adsbox', '.adsbygoogle', '.ad-banner', '.ad-container',
  '.ad-wrapper', '.ad-slot', '.advertisement', '.advert', '.sponsored',
  '.sponsor', '.text-ad'
];

function collectContentBlockers() {
  if (!document.body) return { available: false, reason: 'document.body 尚未就绪' };
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // 不能使用 display:none 或 position:fixed：前者会让所有子节点 offsetParent 为空，
  // 后者本身就让 offsetParent 为 null。
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
  const items = [];
  try {
    for (const selector of BLOCKER_SELECTORS) {
      const node = document.createElement('div');
      node.textContent = 'x';
      if (selector.startsWith('#')) node.id = selector.slice(1);
      else node.className = selector.slice(1);
      const holder = document.createElement('div'); // 隔离 + / ~ 选择器的串扰
      holder.appendChild(node);
      host.appendChild(holder);
      items.push({ selector, node });
    }
    // 对照组：一个中性的 div。如果它也被判定为不可见，说明是测量环境的问题，不是拦截器。
    const control = document.createElement('div');
    control.textContent = 'x';
    control.className = 'fp-decoy-control';
    const controlHolder = document.createElement('div');
    controlHolder.appendChild(control);
    host.appendChild(controlHolder);
    document.body.appendChild(host);

    if (!control.offsetParent) {
      return { available: false, reason: '测量容器不可见，无法判断' };
    }
    const blocked = items.filter((item) => !item.node.offsetParent).map((item) => item.selector);
    const ratio = Math.round((blocked.length / items.length) * 1000) / 1000;
    return {
      available: true,
      tested: items.length,
      blockedCount: blocked.length,
      ratio,
      // 部分选择器可能被站点自己的 CSS 命中，用比例而不是"命中一个就报"来判定。
      detected: ratio >= 0.5,
      blocked
    };
  } catch (error) {
    return { available: false, reason: error.message };
  } finally {
    host.remove();
  }
}

// ---------------------------------------------------------------------------
// 18. Tampering self-check
// ---------------------------------------------------------------------------
// 站点常用"原生函数是否还是 [native code]"来识别被改写的浏览器环境；
// 这也是补环境最容易失败的一步。本维度只做自检，不尝试绕过。
function collectTamperCheck() {
  const toString = Function.prototype.toString;
  const nativePattern = /\{\s*\[native code\]\s*\}/;
  const probe = (name, getter) => {
    try {
      const fn = getter();
      if (typeof fn !== 'function') return { name, status: 'missing' };
      const source = toString.call(fn);
      return { name, status: nativePattern.test(source) ? 'native' : 'patched', sample: source.slice(0, 90) };
    } catch (error) {
      return { name, status: 'error', sample: error.message };
    }
  };

  const checks = [
    probe('Function.prototype.toString', () => Function.prototype.toString),
    probe('Object.getOwnPropertyDescriptor', () => Object.getOwnPropertyDescriptor),
    probe('Date.now', () => Date.now),
    probe('Math.random', () => Math.random),
    probe('performance.now', () => performance.now),
    probe('CanvasRenderingContext2D#getImageData', () => window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype.getImageData),
    probe('HTMLCanvasElement#toDataURL', () => window.HTMLCanvasElement && HTMLCanvasElement.prototype.toDataURL),
    probe('WebGLRenderingContext#getParameter', () => window.WebGLRenderingContext && WebGLRenderingContext.prototype.getParameter),
    probe('AudioContext#createOscillator', () => window.AudioContext && AudioContext.prototype.createOscillator),
    probe('Navigator#webdriver getter', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
      return descriptor && descriptor.get;
    })
  ];

  const pluginType = Object.prototype.toString.call(navigator.plugins);
  const structural = [
    { name: 'navigator.plugins 类型', ok: pluginType === '[object PluginArray]', value: pluginType },
    { name: 'document.all == null', ok: document.all == null, value: String(document.all == null) },
    { name: 'navigator instanceof Navigator', ok: navigator instanceof Navigator, value: String(navigator instanceof Navigator) },
    { name: 'window 类型', ok: Object.prototype.toString.call(window) === '[object Window]', value: Object.prototype.toString.call(window) }
  ];
  if (window.chrome) {
    structural.push({ name: 'window.chrome 类型', ok: typeof window.chrome === 'object', value: typeof window.chrome });
  }

  const patched = checks.filter((check) => check.status === 'patched');
  const missing = checks.filter((check) => check.status === 'missing' || check.status === 'error');
  const structuralBad = structural.filter((item) => !item.ok);
  return {
    available: true,
    checks,
    structural,
    total: checks.length,
    patchedCount: patched.length,
    missingCount: missing.length,
    structuralBadCount: structuralBad.length
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export async function collectSupplementalFingerprint() {
  const tasks = {
    clientHints: collectClientHints(),
    webgl2: collectWebGL2(),
    webgpu: collectWebGPU(),
    webrtc: collectWebRTC(),
    mediaDevices: collectMediaDevices(),
    speech: collectSpeech(),
    permissionsStorage: collectPermissionsStorage(),
    batterySensors: collectBatterySensors(),
    codecsDrm: collectCodecsDrm(),
    cssDom: collectCssDom(),
    jsEngine: collectJsEngine(),
    automation: collectAutomation(),
    plugins: collectPlugins(),
    fontsExpanded: collectFontsExpanded(),
    canvasExtra: collectCanvasExtra(),
    envDetails: collectEnvDetails(),
    contentBlockers: collectContentBlockers(),
    tamper: collectTamperCheck()
  };
  const entries = await Promise.all(
    Object.entries(tasks).map(async ([key, promise]) => {
      try {
        return [key, await promise];
      } catch (error) {
        return [key, { available: false, error: error.message }];
      }
    })
  );
  return Object.fromEntries(entries);
}
