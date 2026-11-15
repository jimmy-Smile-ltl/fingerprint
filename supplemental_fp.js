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

  const issues = [];
  if (webdriver) issues.push('navigator.webdriver=true');
  if (headlessUA) issues.push('Headless UA');
  if (found.length) issues.push('注入标记');
  if (cdc.length) issues.push('CDC 标记');
  if (softwareRenderer) issues.push('软件渲染');
  if (chromium && !chromeObject) issues.push('缺少 window.chrome');
  if (chromium && pluginCount === 0) issues.push('插件数量为 0');
  if (!languageCount) issues.push('语言列表为空');
  if (sizeAnomaly) issues.push('窗口尺寸异常');

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
    issueCount: issues.length
  };
}

// ---------------------------------------------------------------------------
// 13. Expanded font list
// ---------------------------------------------------------------------------
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
    installed
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
    fontsExpanded: collectFontsExpanded(),
    canvasExtra: collectCanvasExtra()
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
