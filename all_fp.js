/**
 * 浏览器指纹综合示例 — 全部指纹维度 + 反指纹检测 + 综合测试
 *
 * 原文: 深入浏览器指纹：Canvas、WebGL、Audio是如何暴露你的身份的？
 * 链接: https://blog.csdn.net/u012220174/article/details/157870592
 * 作者: iDao技术魔方
 *
 * 涵盖内容：
 *   1. Canvas 指纹   — 像素渲染差异
 *   2. WebGL 指纹    — GPU / 渲染器信息（基础 + 高级着色器）
 *   3. Audio 指纹    — 音频堆栈处理差异
 *   4. 字体指纹      — 系统字体检测
 *   5. 硬件信息      — RAM / CPU 核心数 / 触摸
 *   6. 时区 & 语言    — Intl / timezone
 *   7. 反指纹检测     — Farbling 检测 / WebGL 拦截检测
 *   8. 综合指纹类     — 组合所有维度，生成单一 visitorId
 *   9. 测试 & 演示    — 浏览器 / Node.js 通用测试入口
 *
 * 使用方式:
 *   浏览器: <script type="module" src="all_fp.js"></script>  或直接引入
 *   Node.js: node all_fp.js  (需要安装 blueimp-md5: npm i blueimp-md5)
 */

import md5 from 'blueimp-md5';

// ============================================================================
// 0. 工具函数
// ============================================================================

/**
 * 简易哈希（FNV-1a 变体），不依赖外部库时使用。
 * 输出 32 位 hex 字符串。
 * @param {string} str - 输入字符串
 * @returns {string} 8 字符十六进制哈希
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 保持在 32 位有符号整数范围
  }
  return Math.abs(hash).toString(16);
}

/**
 * 使用 blueimp-md5 生成哈希（与项目其他模块保持一致）
 * @param {string} data
 * @returns {string} MD5 hex
 */
function md5Hash(data) {
  return md5(data);
}

// ============================================================================
// 1. Canvas 指纹 — "像素的秘密"
// ============================================================================
//
// 原理:
//   不同操作系统的字体渲染引擎（Windows DirectWrite / macOS Core Text /
//   Linux FreeType）、GPU 抗锯齿算法、亚像素渲染策略各不相同。
//   即便在相同 Canvas 上绘制完全相同的文字和图形，toDataURL() 输出的
//   像素数据在字节级别也会存在差异，从而唯一标识设备。
//
// 关键渲染差异来源:
//   - 字体 hinting / anti-aliasing（ClearType vs 灰度抗锯齿）
//   - 颜色空间 (sRGB / Display P3)
//   - GPU 浮点精度差异
//   - emoji 字体的不同（不同系统上的 😃 渲染效果截然不同）
// ============================================================================

/**
 * 基础 Canvas 指纹 — 教学版
 * 绘制文字 + emoji + 几何图形，将 toDataURL 结果哈希后作为指纹。
 * @returns {{ hash: string, rawData: string }}
 */
function getCanvasFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 设置画布尺寸（尺寸越大，渲染差异信息越多）
  canvas.width = 200;
  canvas.height = 50;

  // 1. 绘制橙色背景
  ctx.fillStyle = '#f60';
  ctx.fillRect(0, 0, 200, 50);

  // 2. 绘制文字 — 关键！字体和抗锯齿产生差异
  //    "Times New Roman" 是不同 OS 上渲染差异最大的字体之一
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#069';
  ctx.font = '16px "Times New Roman"';
  ctx.fillText('FingerprintJS 🤓', 10, 30);

  // 3. 绘制几何图形 — 增加熵值
  ctx.strokeStyle = '#06f';
  ctx.arc(150, 25, 15, 0, Math.PI * 2);
  ctx.stroke();

  // 4. 导出为 Base64 并哈希 — 这是指纹核心
  const data = canvas.toDataURL('image/png');
  return {
    hash: md5Hash(data),
    rawData: data
  };
}

/**
 * Canvas 指纹 — 生产级（参考 fingerprintjs 实现）
 * 使用特定测试字符串 "Cwm fjordbank glyphs vext quiz" 覆盖多种字形，
 * 包括连字 (ligature)、字距 kerning 等容易产生渲染差异的特征。
 *
 * 额外检测: 判断 Canvas 是否被 Farbling（每次 toDataURL 结果不同）
 * @returns {{ hash: string, rawData: string, isStable: boolean }}
 */
function getCanvasFingerprintAdvanced() {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 60;
  canvas.style.display = 'none';

  const ctx = canvas.getContext('2d');

  // 多行文字渲染（覆盖 emoji、特殊字形）
  // "Cwm fjordbank glyphs vext quiz" 包含 fj / rd / glyph 等连字
  ctx.font = '14px Arial';
  ctx.fillText('Cwm fjordbank glyphs vext quiz 😃', 2, 20);

  // 几何图形增加渲染差异
  ctx.beginPath();
  ctx.moveTo(100, 5);
  ctx.lineTo(120, 35);
  ctx.stroke();

  // 检测 Farbling（Brave 等浏览器注入噪声）
  const data1 = canvas.toDataURL();
  const data2 = canvas.toDataURL();
  const isStable = (data1 === data2);

  return {
    hash: md5Hash(data1),
    rawData: data1,
    isStable: isStable
  };
}

// ============================================================================
// 2. WebGL 指纹 — "GPU 的指纹"
// ============================================================================
//
// 原理:
//   WebGL 暴露了 GPU 厂商 (UNMASKED_VENDOR_WEBGL)、渲染器型号
//   (UNMASKED_RENDERER_WEBGL) 以及最大纹理尺寸、最大顶点属性数等
//   硬件能力参数。不同 GPU 的这些值组合几乎是唯一的。
//
// 关键枚举值:
//   gl.VENDOR                   — 浏览器报告（可能被伪装）
//   gl.RENDERER                 — 浏览器报告（可能被伪装）
//   WEBGL_debug_renderer_info   — 绕过伪装，获取真实 GPU
//   gl.MAX_TEXTURE_SIZE         — 最大纹理尺寸（硬件能力）
//   gl.MAX_VIEWPORT_DIMS        — 最大视口
//   gl.MAX_VERTEX_ATTRIBS       — 最大顶点属性数
//
// 为什么 WebGL 指纹强大？
//   1. GPU 型号极其多样（Intel UHD / Iris Xe / AMD Radeon / NVIDIA / Apple M）
//   2. 同一 GPU 的不同驱动版本也产生差异
//   3. 手机 GPU 型号碎片化严重
//   4. 很难被伪造（WebGL 参数直接反映硬件能力）
// ============================================================================

/**
 * 获取 WebGL 上下文（兼容写法）
 * @returns {WebGLRenderingContext|null}
 */
function getWebGLContext() {
  const canvas = document.createElement('canvas');
  try {
    return canvas.getContext('webgl')
        || canvas.getContext('experimental-webgl');
  } catch (e) {
    return null;
  }
}

/**
 * 基础 WebGL 指纹
 * 枚举 GPU 参数、扩展、能力
 * @returns {string|null} 指纹字符串（以 '|' 连接各项），或 null（不支持 WebGL）
 */
function getWebGLFingerprint() {
  const gl = getWebGLContext();
  if (!gl) return null;

  const result = [];

  // ---- 1. 基础参数（浏览器报告的版本，可能经过标准化处理）----
  result.push('vendor:' + gl.getParameter(gl.VENDOR));
  result.push('renderer:' + gl.getParameter(gl.RENDERER));
  result.push('version:' + gl.getParameter(gl.VERSION));
  result.push('shadingLangVersion:' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));

  // ---- 2. 真实 GPU 信息（需要 WEBGL_debug_renderer_info 扩展）----
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    result.push('unmaskedVendor:' + gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
    result.push('unmaskedRenderer:' + gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
  }

  // ---- 3. 硬件能力参数 — 不同 GPU 差异很大 ----
  result.push('maxTextureSize:' + gl.getParameter(gl.MAX_TEXTURE_SIZE));
  result.push('maxViewportDims:' + gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  result.push('maxVertexAttribs:' + gl.getParameter(gl.MAX_VERTEX_ATTRIBS));

  // ---- 4. 扩展列表 — 不同 GPU/驱动支持的扩展集不同 ----
  const extensions = gl.getSupportedExtensions();
  if (extensions) {
    result.push('extensions:' + extensions.sort().join(','));
  }

  return result.join('|');
}

/**
 * 高级 WebGL 指纹 — 通过着色器渲染获取像素级差异
 *
 * 原理: 不同 GPU 对着色器浮点运算的精度不同（MAD vs FMA 指令等），
 *       渲染相同场景后 readPixels 读取的像素值会存在微小差异。
 *       这种差异极其稳定且难以伪造。
 *
 * @returns {string|null} 渲染结果的像素数组，或 null
 */
function getAdvancedWebGLFingerprint() {
  const gl = getWebGLContext();
  if (!gl) return null;

  try {
    // 顶点着色器
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vShader, `
      attribute vec2 attrVertex;
      varying vec2 varyinTexCoordinate;
      uniform vec2 uniformOffset;
      void main() {
        varyinTexCoordinate = attrVertex + uniformOffset;
        gl_Position = vec4(attrVertex, 0.0, 1.0);
      }
    `);
    gl.compileShader(vShader);

    // 片段着色器
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, `
      precision mediump float;
      varying vec2 varyinTexCoordinate;
      void main() {
        gl_FragColor = vec4(varyinTexCoordinate, 0.0, 1.0);
      }
    `);
    gl.compileShader(fShader);

    // 创建程序并链接
    const program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // 绑定顶点坐标
    const vertexPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
    const vertices = new Float32Array([
      -0.2, -0.9, 0,
      0.4,  -0.26, 0,
      0,     0.732134444, 0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const attrVertex = gl.getAttribLocation(program, 'attrVertex');
    gl.vertexAttribPointer(attrVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(attrVertex);

    const uniformOffset = gl.getUniformLocation(program, 'uniformOffset');
    gl.uniform2f(uniformOffset, 1, 1);

    // 渲染
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

    // 读取像素 — 不同 GPU 这里的值不同！
    const pixels = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    return pixels.join(',');
  } catch (e) {
    return null;
  }
}

// ============================================================================
// 3. Audio 指纹 — "声音里的身份"
// ============================================================================
//
// 原理:
//   浏览器 Audio API 通过音频处理管线（振荡器 → 压缩器 → 渲染）产生一个
//   波形样本。不同设备由于：
//     - 操作系统音频栈差异（Windows WASAPI / macOS CoreAudio / Linux ALSA）
//     - 浮点精度差异
//     - 浏览器使用的音频库版本
//     导致产生的波形数据在微小位数上存在差异。
//
// 稳定性:
//   Audio 指纹在相同设备上非常稳定（多次采集结果一致），但不同设备间
//   差异足够大，可用于识别。是 FingerprintJS 中权重很高的维度。
//
// 注意:
//   - iOS 11 对 AudioContext 有限制，需要在用户交互后才能使用
//   - 使用 OfflineAudioContext 快速渲染，不产生实际声音
// ============================================================================

/**
 * 获取 Audio 指纹
 * 使用振荡器 → 动态压缩器的标准管线，取渲染后波形的采样点。
 *
 * @param {number} [timeoutMs=1000] - 超时时间（毫秒）
 * @returns {Promise<{hash: string, rawData: string}>}
 */
function getAudioFingerprint(timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    // iOS 11 检测 — 该版本的 AudioContext 需要用户交互，跳过
    if (navigator && navigator.userAgent
        && navigator.userAgent.match(/OS 11.+Version\/11.+Safari/)) {
      resolve({ hash: '', rawData: 'iOS11_excluded' });
      return;
    }

    const AudioContext = (typeof window !== 'undefined')
      ? (window.OfflineAudioContext || window.webkitOfflineAudioContext)
      : null;

    if (!AudioContext) {
      resolve({ hash: '', rawData: 'not_available' });
      return;
    }

    try {
      // 创建离线音频上下文（1 通道，44100Hz 采样率，44100 采样点 = 1 秒）
      const context = new AudioContext(1, 44100, 44100);

      // ---- 创建音频处理管线: 振荡器 → 压缩器 → 输出 ----

      // 1. 振荡器 — 产生三角波 (10000Hz)
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, context.currentTime);

      // 2. 动态压缩器 — 这是指纹差异的关键！
      //    压缩算法在不同浏览器/AudioContext 实现中不同
      const compressor = context.createDynamicsCompressor();
      [
        ['threshold', -50],
        ['knee', 40],
        ['ratio', 12],
        ['reduction', -20],
        ['attack', 0],
        ['release', 0.25]
      ].forEach(([param, value]) => {
        if (compressor[param] !== undefined
            && typeof compressor[param].setValueAtTime === 'function') {
          compressor[param].setValueAtTime(value, context.currentTime);
        }
      });

      // 3. 连接管线: oscillator → compressor → destination
      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);

      // 超时保护
      const timeoutId = setTimeout(() => {
        console.warn(
          'Audio fingerprint timed out. UA: ' + navigator.userAgent
        );
        resolve({ hash: '', rawData: 'timeout' });
      }, timeoutMs);

      // 渲染完成回调
      context.oncomplete = function (event) {
        clearTimeout(timeoutId);
        try {
          // 取第 4500~5000 个采样点（避开起始/结束的边界效应）
          const channelData = event.renderedBuffer.getChannelData(0);
          const samples = [];
          for (let i = 4500; i < 5000; i += 10) {
            // 取每 10 个采样点的值，保留足够精度
            samples.push(channelData[i].toFixed(10));
          }

          const rawData = samples.join(',');
          oscillator.disconnect();
          compressor.disconnect();

          resolve({
            hash: md5Hash(rawData),
            rawData: rawData
          });
        } catch (error) {
          reject(error);
        }
      };

      // 启动渲染
      context.startRendering();
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================================================
// 4. 字体指纹
// ============================================================================
//
// 原理:
//   不同操作系统预装的字体不同。通过 Canvas 测量同一测试字符串在不同
//   字体下的渲染宽度，可以推断系统安装了哪些字体。
//   如果使用某字体渲染的宽度与基线字体不同，说明该字体已被安装。
//
// 为什么有效:
//   - macOS 预装 Helvetica Neue / San Francisco / Menlo
//   - Windows 预装 Segoe UI / Calibri / Consolas
//   - Linux 预装 DejaVu Sans / Liberation Sans
//   - 用户主动安装的字体进一步增加唯一性
//   - Office / Adobe 套件会安装大量独特字体
// ============================================================================

/**
 * 获取字体指纹 — 检测系统安装的字体
 * @param {string[]} [testFonts] - 待检测字体列表
 * @returns {string} 逗号分隔的已安装字体名称
 */
function getFontFingerprint(testFonts) {
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const defaultTestFonts = [
    'Helvetica', 'Georgia', 'Verdana', 'Tahoma', 'Arial',
    'Times New Roman', 'Courier New', 'Segoe UI',
    'Calibri', 'Consolas', 'Comic Sans MS',
    'Trebuchet MS', 'Impact', 'Lucida Console',
    'Palatino Linotype', 'Franklin Gothic Medium'
  ];
  const fonts = testFonts || defaultTestFonts;
  const detected = [];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 使用基线字体测量文本宽度
  const testString = 'mmmmmmmmlli'; // m 和 l 宽度差异大，连字能触发更多差异
  const baseWidth = (function () {
    ctx.font = '72px ' + baseFonts[0];
    return ctx.measureText(testString).width;
  })();

  // 检测每种字体是否可用
  fonts.forEach(font => {
    // 以目标字体 + 降级字体设置 font 属性
    // 如果目标字体已安装，宽度会与基线不同
    ctx.font = '72px "' + font + '", ' + baseFonts[0];
    const width = ctx.measureText(testString).width;
    if (width !== baseWidth) {
      detected.push(font);
    }
  });

  return detected.join(',');
}

// ============================================================================
// 5. 硬件信息
// ============================================================================
//
// 原理:
//   Navigator API 暴露了部分硬件配置信息。虽然单个维度的熵值不高，
//   但组合使用可以显著提升指纹的唯一性。
//
// 各字段说明:
//   deviceMemory        — 设备 RAM（GB），通常为 2/4/8/16/32
//   hardwareConcurrency — CPU 逻辑核心数
//   maxTouchPoints      — 触摸设备的最大触摸点数（>0 表示触摸屏）
//   platform            — 操作系统平台
// ============================================================================

/**
 * 获取硬件指纹信息
 * @returns {Object} 硬件信息对象
 */
function getHardwareFingerprint() {
  return {
    // RAM 大小 (GB)，只返回约简值: 0.25/0.5/1/2/4/8
    deviceMemory: (typeof navigator !== 'undefined') ? navigator.deviceMemory : 'N/A',

    // CPU 逻辑核心数
    hardwareConcurrency: (typeof navigator !== 'undefined') ? navigator.hardwareConcurrency : 'N/A',

    // 最大触摸点数（0 = 非触摸屏，5+ = 多点触控）
    maxTouchPoints: (typeof navigator !== 'undefined') ? navigator.maxTouchPoints : 'N/A',

    // 平台
    platform: (typeof navigator !== 'undefined') ? navigator.platform : 'N/A'
  };
}

// ============================================================================
// 6. 时区和语言
// ============================================================================
//
// 原理:
//   时区 + 语言组合不仅能反映地理位置，还能反映用户的系统配置偏好。
//   某些语言/时区组合非常罕见（如 en-US + Asia/Shanghai）。
//   注意: 这些值可以被 VPN 和浏览器语言设置改变，因此不应单独使用。
// ============================================================================

/**
 * 获取时区和语言指纹
 * @returns {Object} 时区和语言信息
 */
function getTimezoneFingerprint() {
  return {
    // IANA 时区 ID（如 'Asia/Shanghai', 'America/New_York'）
    timezone: (typeof Intl !== 'undefined')
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'N/A',

    // UTC 偏移量（分钟），如 UTC+8 = -480
    timezoneOffset: new Date().getTimezoneOffset(),

    // 用户偏好语言列表（按优先级排序）
    languages: (typeof navigator !== 'undefined') ? navigator.languages : ['N/A'],

    // 浏览器界面语言
    language: (typeof navigator !== 'undefined') ? navigator.language : 'N/A'
  };
}

// ============================================================================
// 7. 反指纹技术 & 检测
// ============================================================================
//
// 现代浏览器（Brave / Tor Browser / Firefox Resist Fingerprinting 模式）
// 引入了多种反指纹保护机制。理解这些机制对于逆向分析至关重要——
// 很多网站会检测这些反指纹措施的存在，并据此调整风控策略。
// ============================================================================

// --------------------------------------------------------------------------
// 7.1 Canvas Farbling（画布噪声注入）
//
// Brave 浏览器和 Firefox RFP 模式会在 Canvas toDataURL/toBlob 时注入
// 基于 session 的伪随机噪声，使得每次读取的 Canvas 数据略有不同。
// 这打破了 Canvas 指纹的稳定性（但同时也引入了一个可检测的特征）。
// --------------------------------------------------------------------------

/**
 * 检测 Canvas Farbling（噪声注入）
 *
 * 原理: 在正常浏览器中，两次 toDataURL() 返回完全相同的数据。
 *       启用 Farbling 后，每次调用结果略有不同。
 *
 * @returns {boolean} true = 检测到 Farbling（有噪声注入）
 */
function detectCanvasFarbling() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 绘制一个简单的 1x1 像素
  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(0, 0, 1, 1);

  // 两次读取对比
  const data1 = canvas.toDataURL();
  const data2 = canvas.toDataURL();

  // 如果两次结果不同 → 存在 Farbling
  return data1 !== data2;
}

/**
 * Farbling 原理示意（仅用于理解，非可执行代码）
 *
 * Brave 内部大致实现:
 *   const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
 *   HTMLCanvasElement.prototype.toDataURL = function(...args) {
 *     const data = originalToDataURL.apply(this, args);
 *     return addFarblingNoise(data, getSessionSeed()); // 注入 session 级噪声
 *   };
 */

// --------------------------------------------------------------------------
// 7.2 WebGL 扩展拦截
//
// 防追踪浏览器（如 Brave）会拦截 WEBGL_debug_renderer_info 扩展，
// 阻止网站获取真实的 GPU 型号。
//
// 检测方法: 尝试获取该扩展，如果返回 null 但 WebGL 本身可用，
//           说明浏览器做了拦截（或 GPU 本身不支持该扩展）。
// --------------------------------------------------------------------------

/**
 * 检测 WebGL 反指纹拦截
 *
 * @returns {Object} 检测结果
 *   - webglAvailable: WebGL 是否可用
 *   - debugInfoBlocked: WEBGL_debug_renderer_info 是否被拦截
 *   - vendor: 浏览器报告的 GPU 厂商
 *   - renderer: 浏览器报告的 GPU 型号
 *   - unmaskedVendor: 真实 GPU 厂商（被拦截则为 null）
 *   - unmaskedRenderer: 真实 GPU 型号（被拦截则为 null）
 */
function detectWebGLInterception() {
  const gl = getWebGLContext();

  if (!gl) {
    return {
      webglAvailable: false,
      debugInfoBlocked: null,
      vendor: null,
      renderer: null,
      unmaskedVendor: null,
      unmaskedRenderer: null
    };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  return {
    webglAvailable: true,
    // 如果 WebGL 可用但 debugInfo 为 null → 可能被拦截
    debugInfoBlocked: (debugInfo === null),
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null
  };
}

/**
 * WebGL 扩展拦截的防追踪脚本实现示意
 *
 * 防追踪脚本典型做法:
 *   const originalGetExtension = WebGLRenderingContext.prototype.getExtension;
 *   WebGLRenderingContext.prototype.getExtension = function(name) {
 *     if (name === 'WEBGL_debug_renderer_info') {
 *       return null; // 阻止获取真实 GPU 信息
 *     }
 *     return originalGetExtension.call(this, name);
 *   };
 */

// --------------------------------------------------------------------------
// 7.3 User Agent 标准化
//
// Chrome 正在推进 User-Agent Reduction，将 UA 中的 OS 版本、完整 Chrome
// 版本号等信息简化为固定值。这减少了 UA 的追踪价值，但也创造了一个新的
// 检测特征——恶意爬虫如果使用了错误的 UA 格式，反而更容易被识别。
//
// 过去的 UA（信息丰富）:
//   Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
//   (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.0
//
// 未来的 UA（精简版）:
//   Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
//   (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0
//   ↑ 次要版本号被固定为 0
// --------------------------------------------------------------------------

/**
 * 检测浏览器是否启用了 UA 精简（User-Agent Reduction）
 *
 * 判断方法: 检查 Chrome 次要版本号是否被固定为 "0.0.0"
 *
 * @returns {Object} UA 分析结果
 */
function detectUAReduction() {
  const ua = (typeof navigator !== 'undefined') ? navigator.userAgent : '';
  const match = ua.match(/Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/);
  return {
    userAgent: ua,
    isReduced: match ? (match[3] === '0' && match[4] === '0') : false,
    chromeVersion: match ? match[1] + '.' + match[2] : 'unknown'
  };
}

// ============================================================================
// 8. 综合指纹 — BrowserFingerprinter 类
// ============================================================================
//
// 将以上所有指纹维度组合成一个综合指纹。
// 在生产环境中，单个维度的碰撞率很高，但组合 6+ 个维度后，
// 碰撞率可以降到百万分之一以下。
//
// 使用方式:
//   const fp = new BrowserFingerprinter();
//   const id = await fp.getFingerprint();
// ============================================================================

class BrowserFingerprinter {

  /**
   * 构造函数
   * @param {Object} [options]
   * @param {number} [options.audioTimeout=1000] - Audio 指纹超时 (ms)
   * @param {string[]} [options.testFonts] - 字体检测列表
   */
  constructor(options = {}) {
    this.audioTimeout = options.audioTimeout || 1000;
    this.testFonts = options.testFonts || null;
  }

  /**
   * 获取全部指纹组件（并行执行以提高速度）
   * @returns {Promise<Object>} 包含所有指纹组件的对象
   */
  async getComponents() {
    const results = {};

    // 同步采集（不需要 await）
    results.canvas = getCanvasFingerprintAdvanced();
    results.webglBasic = getWebGLFingerprint();
    results.webglAdvanced = getAdvancedWebGLFingerprint();
    results.fonts = getFontFingerprint(this.testFonts);
    results.hardware = getHardwareFingerprint();
    results.timezone = getTimezoneFingerprint();
    results.farblingDetected = detectCanvasFarbling();
    results.webglInterception = detectWebGLInterception();
    results.uaReduction = detectUAReduction();

    // 异步采集（Audio 需要等待渲染完成）
    results.audio = await getAudioFingerprint(this.audioTimeout);

    return results;
  }

  /**
   * 生成综合指纹哈希
   *
   * 将各个组件的原始数据拼接后做 MD5，生成稳定的 visitorId。
   * 每个组件的原始数据在相同设备上保持一致，不同设备间差异显著。
   *
   * @returns {Promise<{visitorId: string, components: Object}>}
   */
  async getFingerprint() {
    const components = await this.getComponents();

    // 组合所有维度（用 '::' 分隔，避免哈希碰撞）
    const combined = [
      components.canvas.rawData || '',
      components.webglBasic || '',
      components.webglAdvanced || '',
      components.audio.rawData || '',
      components.fonts || '',
      JSON.stringify(components.hardware),
      JSON.stringify(components.timezone)
    ].join('::');

    return {
      visitorId: md5Hash(combined),
      components: components
    };
  }

  /**
   * 生成简短的指纹字符串（用于快速比对）
   * @returns {Promise<string>} visitorId 的前 16 位
   */
  async getShortFingerprint() {
    const result = await this.getFingerprint();
    return result.visitorId.substring(0, 16);
  }
}

// ============================================================================
// 9. FingerprintJS 风格快速接口
// ============================================================================

/**
 * FingerprintJS 兼容接口（模拟 @fingerprintjs/fingerprintjs 的 API）
 *
 * 使用示例:
 *   const fp = await BrowserFP.load();
 *   const result = await fp.get();
 *   console.log(result.visitorId);
 */
const BrowserFP = {
  _instance: null,

  /**
   * 加载指纹实例（FingerprintJS 兼容）
   * @returns {Promise<BrowserFP>}
   */
  async load() {
    if (!this._instance) {
      this._instance = new BrowserFingerprinter();
    }
    return this._instance;
  },

  /**
   * 快速获取访问者 ID
   * @returns {Promise<string>}
   */
  async getVisitorId() {
    const fp = await this.load();
    const result = await fp.getFingerprint();
    return result.visitorId;
  }
};

// ============================================================================
// 10. 测试 & 演示
// ============================================================================

/**
 * 格式化输出（浏览器环境用 DOM，Node 环境用 console）
 */
function print(label, value) {
  if (typeof document !== 'undefined') {
    const ele = document.createElement('p');
    ele.style.fontSize = '12px';
    ele.style.fontFamily = 'monospace';
    ele.innerHTML = `<b>${label}:</b> ${typeof value === 'object' ? JSON.stringify(value) : value}`;
    document.body.appendChild(ele);
  } else {
    console.log(`[${label}]`, value);
  }
}

/**
 * 运行全部测试
 *
 * 浏览器环境:
 *   <script type="module" src="all_fp.js"></script>
 *   模块会自动运行 runAllTests()
 *
 * Node.js 环境:
 *   node all_fp.js
 */
async function runAllTests() {
  const divider = '='.repeat(60);

  console.log(divider);
  console.log('浏览器指纹综合测试');
  console.log('基于: https://blog.csdn.net/u012220174/article/details/157870592');
  console.log(divider);

  // ---- 10.1 Canvas 指纹 ----
  console.log('\n📌 1. Canvas 指纹（基础版）');
  try {
    const canvasFp = getCanvasFingerprint();
    print('Canvas Hash', canvasFp.hash);
    print('Canvas Raw (前 80 字符)', canvasFp.rawData.substring(0, 80) + '...');
  } catch (e) {
    console.error('Canvas FP failed:', e.message);
  }

  console.log('\n📌 2. Canvas 指纹（高级版 + Farbling 检测）');
  try {
    const advancedCanvas = getCanvasFingerprintAdvanced();
    print('Canvas Advanced Hash', advancedCanvas.hash);
    print('Canvas 稳定?', advancedCanvas.isStable ? '✅ 是' : '⚠️ 否（检测到 Farbling）');
  } catch (e) {
    console.error('Canvas Advanced FP failed:', e.message);
  }

  // ---- 10.2 WebGL 指纹 ----
  console.log('\n📌 3. WebGL 指纹');
  try {
    const webglBasic = getWebGLFingerprint();
    if (webglBasic) {
      webglBasic.split('|').forEach(item => print('  ' + item.split(':')[0], item.split(':').slice(1).join(':')));
    } else {
      print('WebGL', '⚠️ 不可用');
    }
  } catch (e) {
    console.error('WebGL FP failed:', e.message);
  }

  console.log('\n📌 4. WebGL 高级着色器指纹');
  try {
    const webglAdvanced = getAdvancedWebGLFingerprint();
    print('WebGL Shader Pixels', webglAdvanced || '⚠️ 不可用');
  } catch (e) {
    console.error('WebGL Advanced FP failed:', e.message);
  }

  // ---- 10.3 Audio 指纹 ----
  console.log('\n📌 5. Audio 指纹');
  try {
    const audioStartTime = +new Date();
    const audioFp = await getAudioFingerprint();
    const audioDuration = +new Date() - audioStartTime;
    print('Audio Hash', audioFp.hash || '⚠️ ' + audioFp.rawData);
    print('Audio 耗时', audioDuration + 'ms');
  } catch (e) {
    console.error('Audio FP failed:', e.message);
  }

  // ---- 10.4 字体指纹 ----
  console.log('\n📌 6. 字体指纹');
  try {
    const fonts = getFontFingerprint();
    print('已安装字体', fonts || '⚠️ 未检测到');
  } catch (e) {
    console.error('Font FP failed:', e.message);
  }

  // ---- 10.5 硬件信息 ----
  console.log('\n📌 7. 硬件信息');
  try {
    const hw = getHardwareFingerprint();
    Object.entries(hw).forEach(([k, v]) => print('  ' + k, v));
  } catch (e) {
    console.error('Hardware FP failed:', e.message);
  }

  // ---- 10.6 时区和语言 ----
  console.log('\n📌 8. 时区和语言');
  try {
    const tz = getTimezoneFingerprint();
    Object.entries(tz).forEach(([k, v]) => print('  ' + k, Array.isArray(v) ? v.join(', ') : v));
  } catch (e) {
    console.error('Timezone FP failed:', e.message);
  }

  // ---- 10.7 反指纹检测 ----
  console.log('\n📌 9. 反指纹检测');
  try {
    print('Canvas Farbling', detectCanvasFarbling() ? '⚠️ 已启用' : '✅ 未启用');

    const webglInt = detectWebGLInterception();
    if (webglInt.webglAvailable) {
      print('WebGL 可用', '✅');
      print('WEBGL_debug_renderer_info 被拦截', webglInt.debugInfoBlocked ? '⚠️ 是' : '✅ 否');
      print('真实 GPU 厂商', webglInt.unmaskedVendor || 'N/A');
      print('真实 GPU 型号', webglInt.unmaskedRenderer || 'N/A');
    } else {
      print('WebGL 可用', '❌ 否');
    }

    const uaInfo = detectUAReduction();
    print('UA 精简', uaInfo.isReduced ? '⚠️ 已启用' : '✅ 未启用');
    print('Chrome 版本', uaInfo.chromeVersion);
  } catch (e) {
    console.error('Anti-FP detection failed:', e.message);
  }

  // ---- 10.8 综合指纹 ----
  console.log('\n📌 10. 综合指纹 (BrowserFingerprinter)');
  try {
    const fingerprinter = new BrowserFingerprinter();
    const result = await fingerprinter.getFingerprint();
    print('Visitor ID', result.visitorId);
    print('组件数量', Object.keys(result.components).length);
  } catch (e) {
    console.error('Comprehensive FP failed:', e.message);
  }

  console.log('\n📌 11. FingerprintJS 兼容接口');
  try {
    const visitorId = await BrowserFP.getVisitorId();
    print('BrowserFP.getVisitorId()', visitorId);
  } catch (e) {
    console.error('BrowserFP failed:', e.message);
  }

  console.log('\n' + divider);
  console.log('✅ 测试完成');
  console.log(divider);
}

// 自动运行（支持和 browser）
// 浏览器环境: 在 DOMContentLoaded 后运行
// Node.js 环境: 直接运行（但部分指纹不可用）
if (typeof window !== 'undefined') {
  // 浏览器环境 — 页面加载完成后延迟 500ms 执行（FingerprintJS 推荐做法）
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(runAllTests, 500);
  });
} else {
  // Node.js 环境 — 直接运行测试
  runAllTests().catch(err => {
    console.error('Fingerprint test error:', err);
  });
}

// ============================================================================
// 导出
// ============================================================================

// 按 ES 模块导出（供其他模块 import 使用）
export {
  // 工具
  hashString,
  md5Hash,

  // Canvas
  getCanvasFingerprint,
  getCanvasFingerprintAdvanced,

  // WebGL
  getWebGLContext,
  getWebGLFingerprint,
  getAdvancedWebGLFingerprint,

  // Audio
  getAudioFingerprint,

  // 字体
  getFontFingerprint,

  // 硬件
  getHardwareFingerprint,

  // 时区
  getTimezoneFingerprint,

  // 反指纹检测
  detectCanvasFarbling,
  detectWebGLInterception,
  detectUAReduction,

  // 综合
  BrowserFingerprinter,
  BrowserFP,

  // 测试
  runAllTests
};
