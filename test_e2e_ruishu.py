"""
test_e2e_ruishu.py — 端到端测试: 指纹补环境 → 瑞数 cookie 生成 → 验证

流程:
  1. 加载 fp_env_patch.js 作为基础浏览器环境
  2. 叠加瑞数专用补丁 (meta 标签 / content 占位 / cookie 处理)
  3. 请求 412 页面 → 提取 O cookie + arg1 + $_ts + VM URL
  4. 下载 VM 代码
  5. 拼装: env + arg2 + ts_res + get_cookie()
  6. node 子进程执行
  7. 提取 P cookie
  8. O+P cookie 验证 (用 curl_cffi 过 TLS 指纹)
  9. (可选) 对比: 用 run_js_proto.js 做基准测试

用法:
  python test_e2e_ruishu.py                          # 默认: 全部测试
  python test_e2e_ruishu.py --env fp_env_patch.js    # 指定 env 文件
  python test_e2e_ruishu.py --compare                # 与 run_js_proto.js 基准对比
  python test_e2e_ruishu.py --verbose                # 详细日志

依赖:
  pip install requests curl_cffi

参考:
  其他/pro2 中国信息通信研究院 瑞数/my_test/test_e2e.py
"""

import re, sys, os, json, urllib.parse, subprocess, tempfile, shutil, time
import requests
from curl_cffi import requests as cffi

# 修复 Windows GBK 编码问题
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_URL = "http://www.caict.ac.cn/kxyj/qwfb/bps/"

# 瑞数基准 env 文件路径（用于对比测试）
RUISHU_BASE = os.path.normpath(os.path.join(
    HERE, "..", "..", "其他", "pro2 中国信息通信研究院 瑞数", "my_test"
))


# ================================================================
# 瑞数专用补丁: 在 fp_env_patch.js 基础上叠加瑞数需要的 API
# ================================================================
RUISHU_PATCH = """
// ====== 瑞数专用补丁 (叠加在 fp_env_patch.js 之上) ======

// 0. ★ 瑞数 VM 需要 Timer 立即执行（与 run_js_proto.js 一致）★
(function() {
    var _realSetTimeout = setTimeout;
    var _realSetInterval = setInterval;
    setTimeout = function(fn, delay) {
        if (typeof fn === 'function') fn();
        return 1;
    };
    setInterval = function(fn, delay) {
        if (typeof fn === 'function') fn();
        return 1;
    };
    clearTimeout = function(id) {};
    clearInterval = function(id) {};
    window.setTimeout = setTimeout;
    window.setInterval = setInterval;
    window.clearTimeout = clearTimeout;
    window.clearInterval = clearInterval;
})();

// 0.5 ★ createConstructor 工厂 — 从 run_js_proto.js 移植
//   瑞数 VM 检测 instanceof HTMLElement / HTMLScriptElement 等
var CONSTRUCTOR_TOKEN = Symbol('CONSTRUCTOR_TOKEN');

function createConstructor(constructorName, enableStrictMode, propertiesList, prototypeMethods, parentConstructorName) {
    var constructorFunction = function(element, propertySetter, validationToken) {
        if (enableStrictMode && !(validationToken && validationToken === CONSTRUCTOR_TOKEN)) {
            throw new Error("Illegal constructor");
        }
        if (parentConstructorName && window[parentConstructorName]) {
            window[parentConstructorName].call(this, element, null, CONSTRUCTOR_TOKEN);
        }
        if (propertySetter && typeof propertySetter === "function") {
            propertySetter(this);
        }
        if (element && typeof element === "object") {
            Object.keys(element).forEach(function(key) {
                if (!this[key]) { this[key] = element[key]; }
            }.bind(this));
        }
        propertiesList.forEach(function(prop) {
            if (prop.name && 'value' in prop) {
                var targetPrototype = constructorFunction.prototype;
                if (prop.targetClass && window[prop.targetClass]) {
                    targetPrototype = window[prop.targetClass].prototype;
                }
                Object.defineProperty(targetPrototype, prop.name, {
                    value: prop.value, writable: prop.writable !== undefined ? prop.writable : false,
                    enumerable: prop.enumerable !== undefined ? prop.enumerable : true,
                    configurable: prop.configurable !== undefined ? prop.configurable : true
                });
            }
        });
    };
    Object.defineProperty(constructorFunction, 'name', { value: constructorName, writable: false, enumerable: false, configurable: true });
    if (parentConstructorName && window[parentConstructorName]) {
        constructorFunction.prototype = Object.create(window[parentConstructorName].prototype);
        constructorFunction.prototype.constructor = constructorFunction;
        Object.setPrototypeOf(constructorFunction, window[parentConstructorName]);
    }
    Object.defineProperty(constructorFunction.prototype, Symbol.toStringTag, { value: constructorName, writable: false, enumerable: false, configurable: true });
    Object.keys(prototypeMethods || {}).forEach(function(methodName) {
        constructorFunction.prototype[methodName] = prototypeMethods[methodName];
    });
    window[constructorName] = constructorFunction;
    return constructorFunction;
}

// 构建 DOM 原型链: EventTarget → Node → Element → HTMLElement → 各元素
createConstructor("EventTarget", true, [], {});
createConstructor("Node", true, [], {}, "EventTarget");
createConstructor("Element", true, [], {}, "Node");
createConstructor("HTMLElement", true, [], {}, "Element");
['HTMLScriptElement','HTMLHeadElement','HTMLCanvasElement','HTMLDivElement',
 'HTMLMetaElement','HTMLAnchorElement','HTMLBodyElement','HTMLHtmlElement',
 'HTMLSpanElement','HTMLFormElement','HTMLInputElement','HTMLButtonElement',
 'HTMLImageElement','HTMLLinkElement','HTMLStyleElement','HTMLParagraphElement',
 'HTMLSelectElement','HTMLOptionElement','HTMLTextAreaElement','HTMLTableElement',
 'HTMLTableRowElement','HTMLTableCellElement','HTMLUListElement','HTMLLIElement',
 'HTMLIFrameElement','HTMLVideoElement','HTMLAudioElement','HTMLTemplateElement',
 'HTMLSlotElement','HTMLUnknownElement'].forEach(function(cls) {
    createConstructor(cls, true, [], {}, "HTMLElement");
});

console.log('[ruishu_patch] DOM 原型链已构建 (EventTarget → Node → Element → HTMLElement → ...)');

// 1. meta content 占位符 — test_e2e.py 会替换 arg1_content 为真实值
var content = "arg1_content";

// 2. 增强 document — 瑞数 VM 需要的特殊方法（带原型链）
document.createElement = (function(orig) {
    return function(args) {
        if (args === "meta") {
            var el = {};
            el.__proto__ = window.HTMLMetaElement ? window.HTMLMetaElement.prototype : {};
            el.getAttribute = function(attr) { return (attr === "r") ? "m" : null; };
            el.parentNode = { removeChild: function() {} };
            el.content = content;
            el.charset = "UTF-8";
            return el;
        }
        if (args === "script") {
            var el = {};
            el.__proto__ = window.HTMLScriptElement ? window.HTMLScriptElement.prototype : {};
            el.getAttribute = function(attr) {
                if (attr === "r") return "m";
                if (attr === "src") return "__VM_SRC__";
                return null;
            };
            el.parentElement = { removeChild: function() {} };
            el.parentNode = { removeChild: function() {} };
            el.src = "__VM_SRC__";
            el.innerText = ""; el.textContent = ""; el.content = content;
            el.type = "text/javascript"; el.innerHTML = "";
            return el;
        }
        if (args === "div") {
            var el = {};
            el.__proto__ = window.HTMLDivElement ? window.HTMLDivElement.prototype : {};
            el.getElementsByTagName = function(tag) { return (tag === "i") ? { length: 0 } : []; };
            el.innerHTML = ""; el.style = {};
            return el;
        }
        if (args === "base") { var el = {}; el.__proto__ = window.HTMLElement ? window.HTMLElement.prototype : {}; el.href = ""; return el; }
        if (args === "a") {
            var el = {};
            el.__proto__ = window.HTMLAnchorElement ? window.HTMLAnchorElement.prototype : {};
            el.href = ""; el.hostname = ""; el.protocol = ""; el.pathname = "";
            el.search = ""; el.hash = ""; el.port = "";
            return el;
        }
        if (args === "form") { var el = {}; el.__proto__ = window.HTMLFormElement ? window.HTMLFormElement.prototype : {}; el.getAttribute = function() { return null; }; return el; }
        if (args === "canvas") return _ruishu_canvas;
        // 回退到原始创建
        return orig(args);
    };
})(document.createElement);

document.getElementsByTagName = function(tag) {
    if (tag === "script") {
        return [
            {
                getAttribute: function(attr) {
                    if (attr === "r") return "m";
                    if (attr === "src") return "__VM_SRC__";
                    return null;
                },
                parentElement: { removeChild: function() {} },
                parentNode: { removeChild: function() {} },
                src: "__VM_SRC__",
                innerText: "",
                textContent: "",
                content: content,
                toString: function() { return "[object HTMLScriptElement]"; }
            },
            {
                getAttribute: function(attr) {
                    if (attr === "r") return "m";
                    return null;
                },
                parentElement: { removeChild: function() {} },
                src: "__VM_SRC__",
                innerText: "",
                toString: function() { return "[object HTMLScriptElement]"; }
            }
        ];
    }
    if (tag === "meta") {
        return [
            {
                getAttribute: function(attr) {
                    if (attr === "r") return "m";
                    return null;
                },
                parentNode: { removeChild: function() {} },
                content: content,
                charset: "UTF-8"
            },
            {
                getAttribute: function(attr) {
                    if (attr === "r") return "m";
                    return null;
                },
                parentNode: { removeChild: function() {} },
                content: content
            }
        ];
    }
    if (tag === "base") return { href: "" };
    return [];
};

document.getElementById = function(id) {
    if (id === "root-hammerhead-shadow-ui") return null;
    return {
        getAttribute: function(attr) {
            if (attr === "r") return "m";
            return null;
        },
        parentNode: { removeChild: function() {} },
        content: content
    };
};

document.documentElement = {
    getAttribute: function() { return null; },
    style: {},
    clientWidth: 1920,
    clientHeight: 960
};

document.body = {
    style: {},
    clientWidth: 1920,
    clientHeight: 960,
    getAttribute: function() { return null; },
    appendChild: function() {},
    removeChild: function() {}
};

document.head = {
    appendChild: function() {},
    removeChild: function() {}
};

document.characterSet = "UTF-8";
document.charset = "UTF-8";
document.title = "";
document.referrer = "";

// ★ 对齐 run_js_proto.js: 关键属性覆盖 ★
// run_js_proto.js 中这些属性是 undefined，我们的 env 返回了真实值
// VM 会根据这些值走不同分支，导致 cookie 不同
document.body = undefined;
try { Object.defineProperty(document, 'visibilityState', { value: undefined, writable: true, configurable: true }); } catch(e) {}
try { Object.defineProperty(document, 'hidden', { value: undefined, writable: true, configurable: true }); } catch(e) {}
// WebDriver 检测属性（必须为 undefined，否则被认定为自动化工具）
var _webdriverProps = ['__driver_evaluate','__webdriver_evaluate','__selenium_evaluate','__fxdriver_evaluate',
    '__driver_unwrapped','__webdriver_unwrapped','__selenium_unwrapped','__fxdriver_unwrapped',
    '__webdriver_script_func','__webdriver_script_fn','__webdriver_script_function'];
_webdriverProps.forEach(function(p) { document[p] = undefined; });
// documentMode (IE 特性) — undefined 表示非 IE
document.documentMode = undefined;

// ★ 覆盖 document.cookie — fp_env_patch.js 的 set cookie(v) {} 是空实现
//   瑞数 VM 会写 document.cookie，必须真实存储。
//   模拟真实 document.cookie 语义: 按 name 更新/追加单个 cookie，
//   否则瑞数先写标记 cookie 再写 P cookie 时只有最后一个存活。
var _ck_store = "";
Object.defineProperty(document, 'cookie', {
    get: function() { return _ck_store; },
    set: function(v) {
        var kv = String(v).split(';')[0].trim();   // 忽略 path/expires 等属性段
        if (kv.indexOf('=') < 0) return;
        var name = kv.split('=')[0];
        var pairs = _ck_store.split('; ').filter(function(s) { return s.length > 0; });
        var found = false;
        for (var i = 0; i < pairs.length; i++) {
            if (pairs[i].split('=')[0] === name) { pairs[i] = kv; found = true; break; }
        }
        if (!found) pairs.push(kv);
        _ck_store = pairs.join('; ');
    },
    enumerable: true, configurable: true
});

// ★ 对齐 indexedDB.open — run_js_proto.js 返回简单 {}
indexedDB = {
    open: function() { return {}; }
};
window.indexedDB = indexedDB;

// ★ localStorage/sessionStorage.getItem 返回 undefined（对齐 run_js_proto.js）
localStorage.getItem = function(k) { return undefined; };
sessionStorage.getItem = function(k) { return undefined; };

// ★ 完全替换 Canvas 为 run_js_proto.js 的精简版本
//   run_js_proto.js: CanvasRenderingContext2D.prototype 只有属性无方法
//   返回的 ctx 通过 __proto__ 继承属性
CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
CanvasRenderingContext2D.prototype = {
    canvas: {},
    direction: "ltr", fillStyle: "#000000", filter: "none",
    font: "10px sans-serif", fontKerning: "auto", fontStretch: "normal",
    fontVariantCaps: "normal", globalAlpha: 1, globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true, imageSmoothingQuality: "low", letterSpacing: "0px",
    lineCap: "butt", lineDashOffset: 0, lineJoin: "miter", lineWidth: 1, miterLimit: 10,
    shadowBlur: 0, shadowColor: "rgba(0, 0, 0, 0)", shadowOffsetX: 0, shadowOffsetY: 0,
    strokeStyle: "#000000", textAlign: "start", textBaseline: "alphabetic", textRendering: "auto",
    wordSpacing: "0px"
};
window.CanvasRenderingContext2D = CanvasRenderingContext2D;

// 覆盖 canvas 元素的行为（必须在 document.createElement 之前定义）
var _ruishu_canvas = {
    getContext: function(arg) {
        if (arg === "2d") {
            var ctx = {};
            ctx.__proto__ = CanvasRenderingContext2D.prototype;
            return ctx;
        }
        if (arg === "webgl" || arg === "experimental-webgl") {
            return {
                getParameter: function(p) { return null; },
                getExtension: function(n) { return null; },
                getSupportedExtensions: function() { return []; },
                getShaderPrecisionFormat: function() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
                createShader: function() { return {}; },
                createProgram: function() { return {}; },
                shaderSource: function(){}, compileShader: function(){},
                attachShader: function(){}, linkProgram: function(){}, useProgram: function(){},
                createBuffer: function() { return {}; }, bindBuffer: function(){},
                bufferData: function(){}, getAttribLocation: function(){ return 0; },
                getUniformLocation: function(){ return {}; },
                enableVertexAttribArray: function(){}, vertexAttribPointer: function(){},
                uniform2f: function(){}, drawArrays: function(){},
                readPixels: function(){}, clearColor: function(){},
                clear: function(){}, enable: function(){},
                VENDOR: 0x1F00, RENDERER: 0x1F01, VERSION: 0x1F02,
                SHADING_LANGUAGE_VERSION: 0x8B8C, MAX_TEXTURE_SIZE: 0x0D33,
                MAX_VIEWPORT_DIMS: 0x0D3A, MAX_VERTEX_ATTRIBS: 0x8869,
                VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
                ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, FLOAT: 0x1406,
                TRIANGLE_STRIP: 0x0005, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
                DEPTH_TEST: 0x0B71, LEQUAL: 0x0203, COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100,
            };
        }
        return null;
    },
    toDataURL: function() {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACWCAYAAABkW7XSAAAAAXNSR0IArs4c6QAABGJJREFUeF7t1AEJAAAMAsHZv/RyPNwSyDncOQIECEQEFskpJgECBM5geQICBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAQdWMQCX4yW9owAAAABJRU5ErkJggg==";
    },
    width: 280,
    height: 60,
    style: {}
};
window.canvas = _ruishu_canvas;
console.log('[ruishu_patch] Canvas 已替换为 run_js_proto.js 精简版本');

// ★ 对齐 window 属性
window.attachEvent = undefined;
window.detachEvent = undefined;
window.mozIndexedDB = undefined;
window.webkitIndexedDB = undefined;
window.CollectGarbage = undefined;
window.ActiveXObject = undefined;
window.globalStorage = undefined;
window.openDatabase = undefined;
window.webkitRequestFileSystem = undefined;
window.TEMPORARY = 0;
window.PERSISTENT = 1;
window.clientInformation = { webdriver: false };
window.external = undefined;
window.sidebar = undefined;
window.opera = undefined;
window.orientation = undefined;

// ★ 对齐 navigator — 关键检测属性
navigator.webdriver = false;
navigator.taintEnabled = function() { return false; };
navigator.plugins = { length: 5, item: function(){return null;}, namedItem: function(){return null;}, refresh: function(){} };
navigator.mimeTypes = { length: 2, item: function(){return null;}, namedItem: function(){return null;} };

// ★ 对齐 screen 扩展属性
screen.availLeft = 0;
screen.availTop = 0;
screen.orientation = { angle: 0, type: "landscape-primary", onchange: null };

// 3. window 补充
window.outerHeight = 1080;
window.outerWidth = 1920;
window.innerHeight = 960;
window.innerWidth = 1707;
window.devicePixelRatio = 2;
window.TEMPORARY = 0;
window.PERSISTENT = 1;

// 4. navigator 补充 (部分 FP_CONFIG 可能没有)
if (!navigator.plugins || !navigator.plugins.length) {
    navigator.plugins = { length: 0, item: function(){return null;}, namedItem: function(){return null;}, refresh: function(){} };
}
if (!navigator.mimeTypes || !navigator.mimeTypes.length) {
    navigator.mimeTypes = { length: 0, item: function(){return null;}, namedItem: function(){return null;} };
}

// 5. WebGL 补充 — 确保 debug_renderer_info 可用
if (typeof WebGLRenderingContext !== 'undefined') {
    var _origGetExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(name) {
        if (name === 'WEBGL_debug_renderer_info') {
            return {
                UNMASKED_VENDOR_WEBGL: 0x9245,
                UNMASKED_RENDERER_WEBGL: 0x9246
            };
        }
        if (name === 'EXT_texture_filter_anisotropic') {
            return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF };
        }
        return _origGetExtension ? _origGetExtension.call(this, name) : null;
    };
}

// 6. MutationObserver 补丁
MutationObserver = function(cb) { this._cb = cb; };
MutationObserver.prototype = {
    observe: function() {},
    disconnect: function() {},
    takeRecords: function() { return []; }
};
window.MutationObserver = MutationObserver;

// 7. indexedDB 增强
if (!window.indexedDB || !window.indexedDB.open) {
    indexedDB = {
        open: function() {
            return {
                onerror: null, onsuccess: null, onupgradeneeded: null,
                result: {
                    transaction: function() {
                        return { objectStore: function() { return { put: function(){} }; } };
                    },
                    close: function() {}
                }
            };
        }
    };
    window.indexedDB = indexedDB;
}

// 8. 浏览器特有对象
window.attachEvent = undefined;
window.detachEvent = undefined;
window.mozIndexedDB = undefined;
window.webkitIndexedDB = undefined;
window.CollectGarbage = undefined;
window.ActiveXObject = undefined;
window.globalStorage = undefined;
window.openDatabase = undefined;
window.webkitRequestFileSystem = undefined;
window.katalonRunScript = undefined;

// 9. Performance timing（瑞数 VM 可能检查）
if (window.performance && !window.performance.timing) {
    window.performance.timing = {
        navigationStart: Date.now() - 2000,
        loadEventEnd: Date.now() - 500,
        domComplete: Date.now() - 800,
        domInteractive: Date.now() - 1200,
        domainLookupEnd: Date.now() - 1900,
        domainLookupStart: Date.now() - 1950,
        connectEnd: Date.now() - 1800,
        connectStart: Date.now() - 1850,
        requestStart: Date.now() - 1750,
        responseStart: Date.now() - 1500,
        responseEnd: Date.now() - 1000,
        fetchStart: Date.now() - 1950,
    };
}

console.log('[ruishu_patch] 瑞数专用补丁已加载');
"""


# ================================================================
# Step 1: 请求 412 页面 → 提取参数
# ================================================================
def extract_412_params(url):
    """请求 412 页面，提取 meta content、$_ts 脚本、VM URL、O cookie"""
    r = requests.get(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    }, verify=False)
    print(f"\n{'='*60}")
    print(f"[Step 1] 请求 412 页面")
    print(f"  URL:  {url}")
    print(f"  状态: {r.status_code}, 大小: {len(r.text)} bytes")

    # O cookie
    o_cookie = ""
    set_cookie = r.headers.get("Set-Cookie", "")
    m = re.search(r'(qCRd[^=]+=[^;]+)', set_cookie)
    if m:
        o_cookie = m.group(1)
        print(f"  O cookie: {o_cookie[:50]}...")
    else:
        # 站点轮换 cookie 前缀时的通用回退: 取第一个 name=value 对
        m2 = re.search(r'([A-Za-z][A-Za-z0-9_]{2,20}=[^;,]+)', set_cookie)
        if m2:
            o_cookie = m2.group(1)
            print(f"  O cookie (通用回退): {o_cookie[:50]}...")
        else:
            print(f"  ⚠️ 未找到 O cookie (Set-Cookie: {set_cookie[:60] if set_cookie else 'NONE'})")

    # meta content (arg1)
    arg1 = ""
    m = re.search(r'content="([^"]+)"[^>]*r=.m.', r.text)
    if m:
        arg1 = m.group(1)
        print(f"  meta content: {arg1[:30]}... ({len(arg1)} chars)")
    else:
        print(f"  ⚠️ 未找到 meta content")

    # $_ts 脚本 (arg2)
    arg2 = ""
    m = re.search(r'(<script[^>]*r=.m.[^>]*>)(_?\$ts[^<]+)(</script>)', r.text)
    if m:
        arg2 = m.group(2)
    if not arg2:
        nsd_m = re.search(r'nsd=(\d+)', r.text)
        if nsd_m:
            start = max(0, r.text.rfind('<script', 0, nsd_m.start()))
            end = r.text.find('</script>', nsd_m.start())
            if start >= 0 and end > start:
                arg2 = re.sub(r'^<script[^>]*>', '', r.text[start:end])
    if arg2:
        print(f"  $_ts 脚本: {len(arg2)} chars")
    else:
        print(f"  ⚠️ 未找到 $_ts 脚本")

    # VM 文件 URL — 瑞数 VM 路径会定期轮换，不能硬编码，直接从页面提取第一个外部 .js
    ts_url = ""
    m = re.search(r'src="(/[^"]+?\.js[^"]*)"', r.text)
    if m:
        parsed = urllib.parse.urlparse(url)
        ts_url = f"{parsed.scheme}://{parsed.netloc}{m.group(1)}"
        print(f"  VM URL: {ts_url}")
    else:
        print(f"  ⚠️ 未找到 VM URL")

    return o_cookie, arg1, arg2, ts_url


# ================================================================
# Step 2: 下载 VM 代码
# ================================================================
def download_vm(ts_url):
    """下载 VM 解释器代码"""
    print(f"\n[Step 2] 下载 VM 代码")
    r = requests.get(ts_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": DEFAULT_URL,
    }, verify=False)
    print(f"  VM 代码: {len(r.text)} bytes")
    return r.text


# ================================================================
# Step 3: 拼装完整 JS
# ================================================================
def build_js(env_path, arg1, arg2, ts_res, add_ruishu_patch=True, vm_src=""):
    """拼装完整 JS: env + 瑞数补丁 + $_ts + VM + get_cookie()"""
    print(f"\n[Step 3] 拼装 JS")

    with open(env_path, 'r', encoding='utf-8') as f:
        env_code = f.read()

    # 3a. 替换 meta content 占位符
    print(f"  目标 env: {os.path.basename(env_path)} ({len(env_code)} bytes)")

    replaced = False
    if 'arg1_content' in env_code and arg1:
        env_code = env_code.replace('arg1_content', arg1)
        replaced = True
    elif arg1 or True:  # 总是尝试替换（瑞数补丁中有占位符）
        # 瑞数补丁中有 content 占位符
        pass

    # 3b. 叠加瑞数补丁
    if add_ruishu_patch:
        patch = RUISHU_PATCH
        if arg1:
            patch = patch.replace('arg1_content', arg1)
        # VM 脚本路径来自页面动态提取，替换补丁中的 __VM_SRC__ 占位符
        if vm_src:
            patch = patch.replace('__VM_SRC__', vm_src)
        env_code += "\n" + patch
        print(f"  瑞数补丁: {len(RUISHU_PATCH)} bytes")
    else:
        # 即使不加补丁，也注入 content
        if arg1:
            env_code += f'\nvar content = "{arg1}";\n'
            print(f"  content 注入: {arg1[:30]}...")

    if replaced:
        print(f"  content 占位替换: ✅")
    else:
        print(f"  content 占位替换: 已在补丁中处理")

    # 3c. get_cookie() 函数
    get_ck_fn = """
// ====== 提取 cookie ======
function get_cookie() {
    if (typeof document !== 'undefined' && document.cookie && document.cookie.length > 10) {
        return document.cookie;
    }
    return "";
}
"""

    # 3d. 拼接: env + $_ts(内联脚本) + VM代码 + get_cookie()
    js = env_code + "\n" + arg2 + "\n" + ts_res + "\n" + get_ck_fn
    print(f"  总 JS 大小: {len(js)} bytes")
    return js


# ================================================================
# Step 4: Node.js 子进程执行
# ================================================================
def safe_print(msg):
    """Windows GBK 安全打印"""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', errors='replace').decode('ascii'))


def run_node(js_code, cwd=None, timeout=180):
    """执行 JS，提取 P cookie"""
    print(f"\n[Step 4] Node.js 执行")

    if cwd is None:
        cwd = HERE

    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False,
                                       encoding='utf-8', dir=cwd)
    try:
        # 包装 IIFE 确保 sloppy mode
        wrapped = '(function(){\n' + js_code + '\n})();\n'
        wrapped += 'var ck = "";\n'
        wrapped += 'try { ck = document.cookie || ""; } catch(e) { ck = String(e); }\n'
        wrapped += 'console.log("COOKIE:" + ck);\n'
        tmp.write(wrapped)
        tmp.close()

        result = subprocess.run(
            ['node', tmp.name],
            capture_output=True, text=True, timeout=timeout, cwd=cwd
        )
        out = result.stdout + result.stderr

        # 始终保存完整输出用于调试
        debug_path = tmp.name.replace('.js', '_output.txt')
        try:
            with open(debug_path, 'w', encoding='utf-8') as f:
                f.write(out)
        except:
            pass

        # 提取 P cookie
        p_cookie = ""
        m = re.search(r'COOKIE:.*?(qCRd[^=\s]+T=[^\s;]+)', out)
        if not m:
            # 站点轮换 cookie 前缀时的通用回退: 取 COOKIE 行的第一个 name=value 对
            m = re.search(r'COOKIE:\s*([A-Za-z][A-Za-z0-9_]{2,20}=[^\s;]+)', out)
        if m:
            p_cookie = m.group(1)
            print(f"  [OK] node 成功，P cookie: {p_cookie[:60]}...")
        elif re.search(r'COOKIE:', out):
            ck_line = re.search(r'COOKIE:(.*)', out)
            if ck_line:
                cookie_val = ck_line.group(1).strip()
                if len(cookie_val) > 10:
                    print(f"  [WARN] cookie 非空但未匹配 P cookie 格式: {cookie_val[:100]}...")
                else:
                    print(f"  [WARN] cookie 为空 (VM 未生成)")
                    # 打印输出中的错误
                    _show_node_errors(out, debug_path)
            else:
                print(f"  [WARN] 未找到 COOKIE 行")
                _show_node_errors(out, debug_path)
        else:
            print(f"  [FAIL] 无 COOKIE 输出, 输出已保存: {debug_path}")
            _show_node_errors(out, debug_path)
        return p_cookie, out
    finally:
        try: os.unlink(tmp.name)
        except: pass


def _show_node_errors(out, debug_path):
    """显示 node 输出中的关键错误"""
    err = re.search(r'(Error|ReferenceError|TypeError|SyntaxError):?\s*([^\n]+)', out)
    if err:
        print(f"  [ERROR] {err.group(0)[:200]}")
    # 显示最后 20 行非空输出
    lines = [l.strip() for l in out.split('\n') if l.strip()]
    if lines:
        print(f"  [output] 共 {len(lines)} 行, 最后 8 行:")
        for line in lines[-8:]:
            print(f"    {line[:150]}")
    print(f"  [debug] 完整日志: {debug_path}")


# ================================================================
# Step 5: O+P Cookie 验证
# ================================================================
def test_cookie(o_cookie, p_cookie, url):
    """用 curl_cffi 测试 O+P cookie 是否通过"""
    print(f"\n[Step 5] O+P Cookie 验证")
    if not o_cookie or not p_cookie:
        print(f"  ❌ Cookie 缺失: O={'✅' if o_cookie else '❌'}, P={'✅' if p_cookie else '❌'}")
        return None, "no cookies"

    cookies = {}
    for ck in [o_cookie, p_cookie]:
        if '=' in ck:
            k, v = ck.split('=', 1)
            cookies[k] = v

    try:
        r = cffi.get(url, cookies=cookies, impersonate='chrome110', timeout=15)
        status = r.status_code
        detail = f"{len(r.text)} bytes"
        print(f"  状态: {status}, 大小: {detail}")

        if status == 200:
            print(f"\n  {'='*50}")
            print(f"  🎉 SUCCESS! Cookie 有效! 瑞数防护已通过!")
            print(f"  {'='*50}")
        elif status == 400:
            print(f"  ❌ FAIL: 400 — Cookie 被服务器拒绝")
        elif status == 412:
            print(f"  ❌ FAIL: 412 — Cookie 不足，环境仍需完善")
        else:
            print(f"  ⚠️ 状态: {status}")
        return status, detail
    except Exception as e:
        print(f"  ❌ 请求异常: {e}")
        return None, str(e)


# ================================================================
# 主流程
# ================================================================
def test_single_env(env_path, label, url, add_patch=True):
    """测试单个 env 文件"""
    print(f"\n{'#'*60}")
    print(f"# 测试: {label}")
    print(f"# Env:  {os.path.basename(env_path)}")
    print(f"{'#'*60}")

    # 1. 请求 412
    o_cookie, arg1, arg2, ts_url = extract_412_params(url)
    if not arg2:
        print(f"\n❌ [{label}] 无法提取 $_ts 脚本，跳过")
        return None
    if not ts_url:
        print(f"\n❌ [{label}] 无法提取 VM URL，跳过")
        return None

    # 2. 下载 VM
    ts_res = download_vm(ts_url)
    vm_src = urllib.parse.urlparse(ts_url).path if ts_url else ""

    # 3. 拼装 JS
    js = build_js(env_path, arg1, arg2, ts_res, add_ruishu_patch=add_patch, vm_src=vm_src)

    # 4. 执行
    p_cookie, raw_output = run_node(js)

    if not p_cookie:
        print(f"\n❌ [{label}] 无法生成 P cookie")
        print(f"   提示: env 文件可能需要更多瑞数专用 API")
        return None

    print(f"\n  P cookie: {p_cookie[:80]}...")
    print(f"  长度: {len(p_cookie)} chars")

    # 5. 验证
    status, detail = test_cookie(o_cookie, p_cookie, url)
    return {"label": label, "status": status, "detail": detail,
            "o_cookie": o_cookie, "p_cookie": p_cookie}


def main():
    import argparse
    parser = argparse.ArgumentParser(description="瑞数 E2E 测试: 指纹补环境 → Cookie 生成")
    parser.add_argument("--env", default=None, help="env JS 文件路径")
    parser.add_argument("--url", default=DEFAULT_URL, help="目标 URL")
    parser.add_argument("--compare", action="store_true", help="与 run_js_proto.js 基准对比")
    parser.add_argument("--verbose", action="store_true", help="详细日志")
    args = parser.parse_args()

    # 禁用 SSL 警告
    import urllib3
    urllib3.disable_warnings()

    results = []

    # ====== 测试 1: 统一环境 或 fp_env_patch.js + 瑞数补丁 ======
    env_path = args.env or os.path.join(HERE, "fp_env_patch.js")
    # 只有基准文件 (run_js_proto.js / run_rs.js 等) 才内置瑞数逻辑，不需要额外补丁;
    # fp_env_ruishu_plus.js 是"指纹增强环境"，仍需叠加 RUISHU_PATCH (cookie 存储/元素对齐)
    _name = os.path.basename(env_path)
    is_ruishu_full = "run_js_proto" in _name or "run_rs" in _name or _name.startswith("fp_env_ruishu_full")
    label = os.path.basename(env_path)
    if is_ruishu_full:
        label += " (内置瑞数)"
    else:
        label += " + 瑞数补丁"
    if os.path.exists(env_path):
        r = test_single_env(env_path, label, args.url, add_patch=not is_ruishu_full)
        if r: results.append(r)
    else:
        print(f"X 找不到 env 文件: {env_path}")

    # ====== 测试 2: fp_env_standalone_full.js (如果存在) ======
    standalone_path = args.env or os.path.join(HERE, "fp_env_standalone_full.js")
    if standalone_path != env_path and os.path.exists(standalone_path):
        r = test_single_env(standalone_path, "fp_env_standalone_full.js + 瑞数补丁",
                           args.url, add_patch=True)
        if r: results.append(r)

    # ====== 测试 3 (可选): 与 run_js_proto.js 基准对比 ======
    if args.compare:
        proto_path = os.path.join(RUISHU_BASE, "run_js_proto.js")
        if os.path.exists(proto_path):
            r = test_single_env(proto_path, "run_js_proto.js (基准)", args.url, add_patch=False)
            if r: results.append(r)
        else:
            print(f"\n⚠️ 找不到基准文件: {proto_path}")

        run_rs_path = os.path.join(RUISHU_BASE, "run_rs.js")
        if os.path.exists(run_rs_path):
            r = test_single_env(run_rs_path, "run_rs.js (基准)", args.url, add_patch=False)
            if r: results.append(r)

    # ====== 汇总 ======
    print(f"\n\n{'='*60}")
    print(f"  测试结果汇总")
    print(f"{'='*60}")
    for r in results:
        icon = "🎉" if r["status"] == 200 else "❌" if r["status"] else "⚠️"
        print(f"  {icon} {r['label']}: HTTP {r['status']} — {r['detail']}")

    success = any(r["status"] == 200 for r in results)
    print(f"\n  最终结果: {'✅ 通过' if success else '❌ 未通过'}")
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
