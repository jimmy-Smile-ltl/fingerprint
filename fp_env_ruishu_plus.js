/**
 * env_constructor.js — 瑞数补环境 增强版
 *
 * Base layer: env_proto_watch.js 的完整环境（已验证与 code_raw.js 兼容）
 * 增强层:
 *   - createConstructor() — 工厂化 DOM 类构造（原型链 + strict mode + Symbol.toStringTag）
 *   - safeFunction()       — 原生函数 toString 伪装
 *   - watch()              — Proxy 诊断监控（28 个对象，默认开启）
 *   - 丰富的 Navigator/Screen/Performance/Crypto/Canvas 等对象
 *
 * 用法:
 *   node env_constructor.js              # 环境验证（默认 verbose 监控）
 *   node env_constructor.js --quiet      # 环境验证（静默模式）
 *   node env_main.js                     # 直接运行补环境 + VM
 *
 * @version 3.0 — 2026-06 重构：env_proto_watch 作为 base，增强叠加其上
 */
var content = "arg1_content";
VERBOSE = false
// =========================== 基础常量 ===========================
// =========================== Base Layer: env_proto_watch.js ===========================
// 加载已验证可用的基础环境，window={} 隔离模式
Window = function Window() {};
window = self = parent = top = global;
window.__proto__ = Window.prototype;
delete GLOBAL;
delete root;
delete __filename;
delete __dirname;
window.top = window;
window.name =""

window.chrome = {
    "app": {
        "isInstalled": false,
        "InstallState": { "DISABLED": "disabled", "INSTALLED": "installed", "NOT_INSTALLED": "not_installed" },
        "RunningState": { "CANNOT_RUN": "cannot_run", "READY_TO_RUN": "ready_to_run", "RUNNING": "running" }
    }
}
localStorage = {
    removeItem:function (args) {
        console.log("localStorage.removeItem 方法调用参数 args",args)
    },
    setItem(args) {
        console.log("localStorage.setItem 方法调用参数 args",args)
    },
    getItem(args) {
         console.log("localStorage.getItem 方法调用参数 args",args)
         return undefined
    }

}
window.localStorage =  localStorage
sessionStorage = {
    removeItem:function (args) {
        console.log("sessionStorage.removeItem 方法调用参数 args",args)
    },
    setItem(args) {
        console.log("sessionStorage.setItem 方法调用参数 args",args)
    },
    getItem(args) {
         console.log("sessionStorage.getItem 方法调用参数 args",args)
        return undefined
    }
}
window.sessionStorage =  sessionStorage

indexedDB = {
    open: function(args){
         console.log("indexedDB.open 方法调用参数 args",args)
        return {}
    }

}
window.indexedDB = indexedDB
XMLHttpRequest =function (args){
    console.log("window.XMLHttpRequest 方法调用参数 args",args)
}
XMLHttpRequest.prototype = {
    open: function(method, url) { return arguments },
    send: function() {},
    setRequestHeader: function() {}
}
window.XMLHttpRequest  = XMLHttpRequest

function getImageDate() { return 'function getImageData() { [native code] }' }

// CanvasRenderingContext2D — 构造函数 + 原型链（匹配真实浏览器结构）
CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
CanvasRenderingContext2D.prototype = {
    canvas: {},
    direction: "ltr",
    fillStyle: "#000000",
    filter: "none",
    font: "10px sans-serif",
    fontKerning: "auto",
    fontStretch: "normal",
    fontVariantCaps: "normal",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    letterSpacing: "0px",
    lineCap: "butt",
    lineDashOffset: 0,
    lineJoin: "miter",
    lineWidth: 1,
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    textRendering: "auto",
    wordSpacing: "0px",
    getImageDate: getImageDate
};
Object.defineProperty(CanvasRenderingContext2D.prototype, Symbol.toStringTag, { value: "CanvasRenderingContext2D", configurable: true });
window.CanvasRenderingContext2D = CanvasRenderingContext2D;

// Canvas 元素（getContext 返回原型实例，模拟 new CanvasRenderingContext2D()）
var _canvas = {
    getContext: function (arg) {
        if (arg === "2d") {
            // 创建实例：__proto__ 指向 CanvasRenderingContext2D.prototype，继承所有方法
            var ctx = {};
            ctx.__proto__ = CanvasRenderingContext2D.prototype;
            return ctx;
        }
        return null;
    },
    toDataURL: function () {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACWCAYAAABkW7XSAAAAAXNSR0IArs4c6QAABGJJREFUeF7t1AEJAAAMAsHZv/RyPNwSyDncOQIECEQEFskpJgECBM5geQICBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAAYPlBwgQyAgYrExVghIgYLD8AAECGQGDlalKUAIEDJYfIEAgI2CwMlUJSoCAwfIDBAhkBAxWpipBCRAwWH6AAIGMgMHKVCUoAQIGyw8QIJARMFiZqgQlQMBg+QECBDICBitTlaAECBgsP0CAQEbAYGWqEpQAgQdWMQCX4yW9owAAAABJRU5ErkJggg==";
    },
    width: 280,
    height: 60,
    style: {}
};
window.canvas = _canvas;
window.HTMLCanvasElement = function HTMLCanvasElement() {};
HTMLCanvasElement = window.HTMLCanvasElement;

addEventListener = function (args){
     console.log("window.addEventListener 方法调用参数 args",args)
}
window.addEventListener =addEventListener
webkitRequestFileSystem = function (args){
     console.log("window.webkitRequestFileSystem 方法调用参数 args",args)
}
window.webkitRequestFileSystem = webkitRequestFileSystem
MutationObserver = function (args){
     console.log("window.MutationObserver 方法调用参数 args",args)
}
MutationObserver.prototype.disconnect = function (args){
    console.log("window.MutationObserver.disconnect 方法调用参数 args",args)
}
MutationObserver.prototype.takeRecords = function (args){
    console.log("window.MutationObserver.takeRecords 方法调用参数 args",args)
 }
MutationObserver.prototype.observe =  function (args){
    console.log("window.MutationObserver.observe 方法调用参数 args",args)
}
window.MutationObserver =MutationObserver
HTMLAnchorElement  = function (args){
     console.log("window.HTMLAnchorElement 方法调用参数 args",args)
}
window.HTMLAnchorElement =HTMLAnchorElement

clientInformation ={
    webdriver: false
}
window.clientInformation = clientInformation
DOMParser = function (args){
     console.log("window.DOMParser 方法调用参数 args",args)
}
window.DOMParser = DOMParser

Navigator =function (args){
    console.log("window.Navigator 方法调用参数 args",args)
}
window.Navigator =Navigator

window.parseInt = global.parseInt
window.parseFloat = global.parseFloat
window.performance = global.performance
window.Math = global.Math
window.eval = global.eval
window.performance = global.performance
window.JSON = global.JSON
window.crypto = global.crypto
window.btoa = global.btoa
window.atob = global.atob
window.fetch = global.fetch
window.escape  = global.escape
window.WebSocket = global.WebSocket
window.structuredClone = global.structuredClone
window.clearImmediate = global.clearImmediate
window.setImmediate = global.setImmediate
window.RegExp =global.RegExp
window.Number = global.Number
window.decodeURIComponent =global.decodeURIComponent
window.isFinite = global.isFinite
window.Request = global.Request
window.Event = global.Event
window.prompt = global.prompt

window.getFrameLocation = undefined
window.katalonRunScript = undefined
window.attachEvent = undefined
window.mozIndexedDB = undefined
window.webkitIndexedDB = undefined
window.CollectGarbage = undefined
window.ActiveXObject = undefined
window.globalStorage  = undefined
window.TEMPORARY = 0
window.innerHeight = 960
window.innerWidth = 1707
window.outerHeight = 1080
window.outerWidth = 1920
div_tag = {
    getElementsByTagName: function (arg) { if (arg === "i") return { length: 0 }; return []; },
    innerHTML: ""
}
meta_tag ={
    getAttribute :function (args) {
        console.log("meta_tag.getAttribute 方法调用参数 args",args)
        if(args == "r"){
            return "m"
        }
    },
    parentNode : {
      removeChild:function (args) {
            console.log("meta_tag.parentNode.removeChild 方法调用参数 args",args)
        },
    },
 content : content  // meta 内容由运行时注入的 arg1 决定，勿硬编码站点值
}
other_tag ={
    getAttribute :function (args) {
        console.log("other_tag.getAttribute 方法调用参数 args",args)
        if(args == "r"){
            return "m"
        }
    },
    parentNode : {
      removeChild:function (args) {
            console.log("other_tag.parentNode.removeChild 方法调用参数 args",args)
        },
    },
    parentElement : {
            removeChild:function (args) {
                console.log("document.removeChild 方法调用参数 args",args)
            },
    },
    src:"",  // 站点 VM 路径由目标页面决定，运行时注入
    innerText:"",
   content : content,  // meta 内容由运行时注入的 arg1 决定，勿硬编码站点值
    toString: function() { return "[object HTMLScriptElement]"; }
}

document = {
    createElement: function (args) {
        if (args == "div") return div_tag;
        if (args == "canvas") return _canvas;
        if (args == "form") return {};
        if (args == "script") return other_tag;
        return undefined;
    },
    appendChild: function () {},
    removeChild: function () {},
    getElementById: function (args) {
        if (args == "root-hammerhead-shadow-ui") return null;
        return meta_tag;
    },
    createExpression: function () { return {}; },
    getElementsByTagName: function (args) {
        if (args === "script") return [other_tag, other_tag];
        if (args === "meta") return [meta_tag, meta_tag];
        if (args === "base") return {};
        return undefined;
    },
    addEventListener: function () {},
    documentElement: {},
    characterSet: 'UTF-8',
    charset: 'UTF-8',
    all: {}
}

// HTMLAllCollection — document.all 类型模拟
var _allWrapper = {};
_allWrapper.all = new (function FengNewAll() {})();
var HTMLAllCollection = function HTMLAllCollection() {};
HTMLAllCollection.prototype = Array.prototype;
HTMLAllCollection.prototype.constructor = HTMLAllCollection;
Object.setPrototypeOf(_allWrapper.all, HTMLAllCollection.prototype);
for (var _i = 0; _i < 5; _i++) _allWrapper.all.push(_i);
Object.defineProperty(document, "all", {
    get: function () { return _allWrapper.all; },
    configurable: true, enumerable: true
});
window.document = document

open  = function (args) {
    console.log("open 方法调用参数 args",args)
}
window.open =open

// ---------- Location (原型链 + toString) ----------
Location = function Location() {};
Location.prototype = {
    ancestorOrigins: {},
    href: "https://www.caict.ac.cn/kxyj/qwfb/bps/",
    origin: "https://www.caict.ac.cn",
    protocol: "https:",
    host: "www.caict.ac.cn",
    hostname: "www.caict.ac.cn",
    port: "",
    pathname: "/kxyj/qwfb/bps/",
    search: "",
    hash: "",
    assign: function (url) { console.log("[location.assign]", url); },
    replace: function (url) { console.log("[location.replace]", url); },
    reload: function () { console.log("[location.reload]"); },
    toString: function () { return this.href; }
};
Object.defineProperty(Location.prototype, Symbol.toStringTag, { value: "Location", configurable: true });
location = new Location;
window.location = location;

// ---------- History (原型链 + toString + back) ----------
History = function History() {};
History.prototype = {
    state: null,
    scrollRestoration: "auto",
    length: 2,
    back: function back() { console.log("history.back"); },
    forward: function forward() { console.log("history.forward"); },
    go: function go(n) { console.log("history.go", n); },
    pushState: function (state, title, url) { console.log("history.pushState"); },
    replaceState: function (state, title, url) { console.log("history.replaceState"); },
    toString: function () { return "[object History]"; }
};
Object.defineProperty(History.prototype, Symbol.toStringTag, { value: "History", configurable: true });
history = new History;
window.history = history;

// ---------- Navigator (对齐 env_ok.js：仅 5 个属性) ----------
Navigator = function Navigator() {};
Navigator.prototype = {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    webdriver: false,
    languages: ["en-GB", "zh-CN", "zh"],
    platform: "Win32",
    webkitPersistentStorage: {},
};
Object.defineProperty(Navigator.prototype, Symbol.toStringTag, { value: "Navigator", configurable: true });
navigator = {};
navigator.__proto__ = Navigator.prototype;
window.navigator = navigator;
window.clientInformation = navigator;

// ---------- Screen (对齐 env_ok.js) ----------
Screen = function Screen() {};
Screen.prototype = {
    availWidth: 1920,
    availHeight: 1080,
    width: 1707,
    height: 960,
    colorDepth: 32,
    pixelDepth: 32,
    availLeft: 0,
    availTop: 0,
    orientation: { angle: 0, type: "landscape-primary" },
    toString: function () { return "[object Screen]"; }
};
Object.defineProperty(Screen.prototype, Symbol.toStringTag, { value: "Screen", configurable: true });
screen = new Screen;
window.screen = screen;


// Timer stubs + toString 保护（VM 检测 setTimeout.toString 是否被 hook）
setTimeout_ = setTimeout;
setTimeout = function (fn, delay) {
    // delay > 0: 保留真实延迟（Audio 指纹需要），瑞数 VM 只用 delay=0
    if (delay > 0) return setTimeout_(fn, delay);
    if (typeof fn === 'function') fn();
};
setTimeout.toString = function () { return setTimeout_.toString(); };
window.setTimeout = setTimeout;

setInterval_ = setInterval;
setInterval = function (fn, delay) { if (typeof fn === 'function') fn(); };
setInterval.toString = function () { return setInterval_.toString(); };
window.setInterval = setInterval;

clearTimeout = function () {};
window.clearTimeout = clearTimeout;
clearInterval = function () {};
window.clearInterval = clearInterval;
!(() => {
    const origin_log = console.log;
    ;
    // const origin_log = function () {};
    logToConsole = function () {
        return origin_log(...arguments)
        // return
    }
})();

// screen 已在前面通过 new Screen() 创建，此处不再重复定义

// ====================== watch() Proxy 诊断（增强版） ======================
// 设置 WATCH_ON = true 启用监控，改为 false 关闭避免干扰 VM
var WATCH_ON = false;  // true=内置诊断 false=纯净（推荐用 require('./watch.js') 替代）

function _fmt(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'function') return '[Function' + (v.name ? ': ' + v.name : '') + ']';
    if (t === 'string') {
        if (v.length > 80) return '"' + v.substring(0, 80) + '..." (' + v.length + ' chars)';
        return '"' + v + '"';
    }
    if (t === 'object') {
        if (Array.isArray(v)) return '[Array(' + v.length + ')]';
        try { return '[Object ' + (Object.prototype.toString.call(v)) + ']'; }
        catch(e) { return '[Object]'; }
    }
    return String(v);
}

function watch(obj, name, visited) {
    if (!visited) visited = new WeakSet();
    if (obj === null || typeof obj !== 'object' || visited.has(obj)) return obj;
    visited.add(obj);

    return new Proxy(obj, {
        get: function (target, property, receiver) {
            if (typeof property === 'symbol') {
                // 监控 Symbol.toStringTag 的读取（原型链 toString 的关键）
                if (property === Symbol.toStringTag) {
                    var stv = Reflect.get(target, property, receiver);
                    console.log('[WATCH GET] ' + name + '.[[Symbol.toStringTag]] = ' + _fmt(stv));
                    return stv;
                }
                return Reflect.get(target, property, receiver);
            }
            if (property === '__isWatched' || property === '_element') return Reflect.get(target, property, receiver);

            // 检查来自原型链还是自身
            var own = Object.prototype.hasOwnProperty.call(target, property);
            var protoChain = '';
            if (!own && property !== 'constructor' && property !== '__proto__') {
                // 追溯来源
                var p = Object.getPrototypeOf(target);
                while (p && p !== Object.prototype) {
                    if (Object.prototype.hasOwnProperty.call(p, property)) {
                        protoChain = ' [proto: ' + (p.constructor ? p.constructor.name : '?') + ']';
                        break;
                    }
                    p = Object.getPrototypeOf(p);
                }
            }

            var desc = Object.getOwnPropertyDescriptor(target, property);
            var hasGetter = desc && !!desc.get;
            var value = Reflect.get(target, property, receiver);

            // 检查是否是 toString / valueOf 等原型方法
            var isProtoMethod = (property === 'toString' || property === 'valueOf' || property === 'toLocaleString' || property === 'hasOwnProperty');

            if (isProtoMethod || value === undefined || hasGetter || protoChain) {
                var prefix = value === undefined ? '\x1b[33m[WATCH GET]\x1b[0m' :
                             hasGetter    ? '\x1b[36m[WATCH GET getter]\x1b[0m' :
                             protoChain   ? '\x1b[35m[WATCH GET proto]\x1b[0m' :
                                            '[WATCH GET]';
                console.log(prefix + ' ' + name + '.' + String(property) + ' → ' + _fmt(value) + protoChain);
            }

            // 不自动递归 wrap 嵌套对象，避免干扰 VM
            return value;
        },

        set: function (target, property, value, receiver) {
            if (typeof property === 'symbol') {
                if (property === Symbol.toStringTag) {
                    console.log('\x1b[36m[WATCH SET]\x1b[0m ' + name + '.[[Symbol.toStringTag]] ← ' + _fmt(value));
                }
                return Reflect.set(target, property, value, receiver);
            }
            if (property === '__isWatched' || property === '_element') return Reflect.set(target, property, value, receiver);

            var oldVal = target[property];
            var oldStr = _fmt(oldVal);
            var newStr = _fmt(value);
            var typeChange = (typeof oldVal !== typeof value) ? ' \x1b[33mTYPE CHANGE: ' + typeof oldVal + ' → ' + typeof value + '\x1b[0m' : '';

            console.log('[WATCH SET] ' + name + '.' + String(property) + ' ← ' + newStr + ' (was: ' + oldStr + ')' + typeChange);

            return Reflect.set(target, property, value, receiver);
        },

        has: function(target, property) {
            var exists = Reflect.has(target, property);
            if (property === 'toString' || property === Symbol.toStringTag || property === 'valueOf') {
                console.log('[WATCH HAS] ' + name + '["' + String(property) + '"] → ' + exists);
            }
            return exists;
        },

        ownKeys: function(target) {
            var keys = Reflect.ownKeys(target);
            // 只在涉及 toString 相关时打印
            return keys;
        },

        defineProperty: function(target, property, descriptor) {
            var propStr = typeof property === 'symbol' ? '[[' + property.toString() + ']]' : String(property);
            var info = [];
            if (descriptor.get) info.push('getter');
            if (descriptor.set) info.push('setter');
            if ('value' in descriptor) info.push('value=' + _fmt(descriptor.value));
            if ('writable' in descriptor) info.push('writable=' + descriptor.writable);
            console.log('\x1b[36m[WATCH defineProperty]\x1b[0m ' + name + '.' + propStr + ' (' + info.join(', ') + ')');
            return Reflect.defineProperty(target, property, descriptor);
        },

        deleteProperty: function(target, property) {
            console.log('\x1b[31m[WATCH DELETE]\x1b[0m ' + name + '.' + String(property));
            return Reflect.deleteProperty(target, property);
        },

        getPrototypeOf: function(target) {
            var proto = Reflect.getPrototypeOf(target);
            console.log('[WATCH getPrototypeOf] ' + name + ' → ' + (proto && proto.constructor ? proto.constructor.name : _fmt(proto)));
            return proto;
        },

        setPrototypeOf: function(target, proto) {
            console.log('\x1b[36m[WATCH setPrototypeOf]\x1b[0m ' + name + ' ← ' + (proto && proto.constructor ? proto.constructor.name : _fmt(proto)));
            return Reflect.setPrototypeOf(target, proto);
        }
    });
}

// watch 激活已移至文件末尾（确保所有对象已创建完毕后再包裹）
// 旧的 toString 监听已移除（与 updateFunToString 冲突，且产生大量日志）

function obj_toString(obj, name) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: name,
  });
}


// 保存 env_proto_watch 创建的关键对象引用
var _base_document = window.document;
var _base_navigator = window.navigator;
var _base_location = window.location;
var _base_screen = window.screen;
var _base_history = window.history;

// env_ok.js 没有指纹 IIFE，Navigator.prototype 已足够，不再额外设置

CONSTRUCTOR_TOKEN = Symbol('CONSTRUCTOR_TOKEN');
var VERBOSE = !process.argv.includes('--quiet');

// =========================== window 基础 ===========================
// env_proto_watch.js 已经设置了 window={} + 全局映射，这里只做补充
var _nativeSetTimeout = globalThis.setTimeout;
var _nativeSetInterval = globalThis.setInterval;
var _nativeClearTimeout = globalThis.clearTimeout;
var _nativeClearInterval = globalThis.clearInterval;

// =========================== logToConsole 封装 ===========================
!(() => {
    const origin_log = console.log;
    logToConsole = function () { return origin_log(...arguments); };
})();

// =========================== watch() Proxy 监控（增强版） ===========================
// 监控列表 — 基于 code_not_format_not_global.js 的 proxy_array 扩展
// 用法: VERBOSE=true 或传 --verbose 时启用全面监控
const PROXY_LIST = [
    'document', 'location', 'navigator', 'history', 'screen',
    'localStorage', 'sessionStorage',
    'XMLHttpRequest', 'MutationObserver', 'DOMParser',
    'indexedDB', 'CanvasRenderingContext2D', 'HTMLCanvasElement',
    'performance', 'crypto', 'chrome',
    'window.document', 'window.location', 'window.navigator',
    'window.history', 'window.screen',
    'window.localStorage', 'window.sessionStorage',
    'window.document.body', 'window.document.documentElement',
    'document.body', 'document.documentElement',
    'document.head',
];

// 辅助函数：安全获取嵌套对象，不存在则创建
// 使用 eval 找顶层变量，因为 window={} 不再是 globalThis
function safeGetObj(pathStr) {
    var parts = pathStr.split('.');
    var current = eval(parts[0]);  // 从全局作用域查找顶层变量
    if (current === undefined || current === null) { current = {}; eval(parts[0] + ' = {}'); }
    for (var i = 1; i < parts.length; i++) {
        if (current[parts[i]] === undefined || current[parts[i]] === null) {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    return current;
}

// 批量应用 watch 到多个对象
function watchAll(objectList, opts) {
    if (!objectList || !objectList.forEach) { console.log('[watchAll] skipped: no objectList'); return; }
    if (!opts) opts = {};
    objectList.forEach(function(pathStr) {
        try {
            var obj = safeGetObj(pathStr);
            if (obj && typeof obj === 'object' && !obj.__isWatched) {
                var parts = pathStr.split('.');
                var shortName = parts.length > 1 ? pathStr : pathStr;
                var watched = watch(obj, shortName, opts);
                watched.__isWatched = true;

                // 替换全局引用
                if (!pathStr.includes('.')) {
                    // 顶层对象：替换全局变量
                    eval(pathStr + ' = watched');
                } else {
                    // 嵌套对象：替换父对象的引用
                    var parentPath = parts.slice(0, -1).join('.');
                    var propName = parts[parts.length - 1];
                    try {
                        eval(parentPath + '[' + JSON.stringify(propName) + '] = watched');
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error('[watchAll] 跳过:', pathStr, '-', e.message);
        }
    });
    console.log('[watchAll] 已对 ' + objectList.length + ' 个对象启用 Proxy 监控');
    // window 单独监控（skipFilter 避免噪音）
    try {
        var winObj = safeGetObj('window');
        if (winObj && typeof winObj === 'object' && !winObj.__isWatched) {
            window = watch(winObj, 'window', { skipFilter: true, logGet: true, logSet: true, logHas: false });
            window.__isWatched = true;
        }
    } catch(e) {}
}

// =========================== safeFunction() 原生伪装 ===========================
const safeFunction = (function () {
    let initialized = false;
    let myFunction_toString_symbol;

    const set_native = function set_native(func, key, value) {
        Object.defineProperty(func, key, {
            "enumerable": false, "configurable": true, "writable": true, "value": value
        });
    };

    return function safeFunction(func) {
        if (!initialized) {
            Function.prototype.$call = Function.prototype.call;
            const $toString = Function.toString;
            myFunction_toString_symbol = Symbol('functionToString');
            const myToString = function myToString() {
                return typeof this === 'function' && this[myFunction_toString_symbol] || $toString.$call(this);
            };
            delete Function.prototype.toString;
            set_native(Function.prototype, "toString", myToString);
            set_native(Function.prototype.toString, myFunction_toString_symbol, "function toString() { [native code] }");
            initialized = true;
        }
        if (!func.hasOwnProperty(myFunction_toString_symbol)) {
            set_native(func, myFunction_toString_symbol, `function ${func.name || ''}() { [native code] }`);
        }
        return func;
    };
})();

// =========================== createConstructor() 工厂 ===========================
function createConstructor(constructorName, enableStrictMode, propertiesList = [], prototypeMethods = {}, parentConstructorName = null) {
    const instancesData = {};

    const constructorFunction = function (element, propertySetter, validationToken) {
        if (enableStrictMode && !(validationToken && validationToken === CONSTRUCTOR_TOKEN)) {
            throw new Error("Illegal constructor");
        }
        if (parentConstructorName && window[parentConstructorName]) {
            window[parentConstructorName].call(this, element, null, CONSTRUCTOR_TOKEN);
        }
        if (propertySetter && typeof propertySetter === "function") {
            propertySetter(this);
        }
        const instanceProperties = element && typeof element === "object" ? { ...element } : {};
        this._element = Symbol('_element');
        instancesData[this._element] = instanceProperties;
        if (element && typeof element === "object") {
            Object.keys(element).forEach(key => { if (!this[key]) { this[key] = element[key]; } });
        }
        propertiesList.forEach(prop => {
            if (prop.name && 'value' in prop) {
                let targetPrototype = constructorFunction.prototype;
                if (prop.targetClass && window[prop.targetClass]) { targetPrototype = window[prop.targetClass].prototype; }
                Object.defineProperty(targetPrototype, prop.name, {
                    value: prop.value,
                    writable: prop.writable !== undefined ? prop.writable : false,
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

    Object.keys(prototypeMethods).forEach(methodName => {
        constructorFunction.prototype[methodName] = prototypeMethods[methodName];
        if (typeof constructorFunction.prototype[methodName] === "function") { safeFunction(constructorFunction.prototype[methodName]); }
    });

    safeFunction(constructorFunction);
    window[constructorName] = constructorFunction;
    // 同时挂到全局作用域，使 bare variable 引用可用（window={} 隔离模式下必须）
    globalThis[constructorName] = constructorFunction;
    return constructorFunction;
}

// =========================== DOM 类层级构造 ===========================
createConstructor("EventTarget", true, [], {}, "");
createConstructor("Window", true, [], {}, "EventTarget");
// 注意：不设置 window 的 prototype，保持普通对象
// Object.setPrototypeOf(window, Window.prototype);  // 会导致 VM 报错

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
 'HTMLSlotElement','HTMLUnknownElement'].forEach(function(cls) { createConstructor(cls, true, [], {}, "HTMLElement"); });

// ===== Document 构造函数（配合前面的 plain document 做 instanceof） =====
Document = function Document() {};
document.__proto__ = Document.prototype;
// HTMLAllCollection 简单构造函数
HTMLAllCollection = function HTMLAllCollection() {};
HTMLAllCollection.prototype = Array.prototype;

// ================================================================
// PART 2: 浏览器指纹增强层 (叠加在 run_js_proto.js 之上)
// 不修改任何原有代码，只追加
// ================================================================

// ----- 指纹配置接口 -----
var FINAL_FP_CONFIG = {
    // Canvas
    canvasDataURL: null,
    // WebGL
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    webglExtensions: null,
    // Audio
    audioRawSamples: null,
};

window.getFingerprintConfig = function() { return FINAL_FP_CONFIG; };
window.setFingerprintConfig = function(cfg) { Object.assign(FINAL_FP_CONFIG, cfg); };

// ----- Canvas 增强: 提供完整的 2D 上下文 (指纹需要) -----
(function() {
    var _orig_getContext = _canvas.getContext;
    _canvas.getContext = function(type) {
        if (type === '2d') {
            var ctx = {};
            ctx.__proto__ = CanvasRenderingContext2D.prototype;
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = '#000000';
            ctx.font = '10px sans-serif';
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';
            ctx.fillRect = function(){};
            ctx.fillText = function(){};
            ctx.strokeText = function(){};
            ctx.beginPath = function(){};
            ctx.closePath = function(){};
            ctx.moveTo = function(){};
            ctx.lineTo = function(){};
            ctx.arc = function(){};
            ctx.stroke = function(){};
            ctx.fill = function(){};
            ctx.rect = function(){};
            ctx.save = function(){};
            ctx.restore = function(){};
            ctx.scale = function(){};
            ctx.rotate = function(){};
            ctx.translate = function(){};
            ctx.transform = function(){};
            ctx.setTransform = function(){};
            ctx.drawImage = function(){};
            ctx.createLinearGradient = function() { return { addColorStop: function(){} }; };
            ctx.createRadialGradient = function() { return { addColorStop: function(){} }; };
            ctx.measureText = function(text) {
                var fontStr = this.font || '10px sans-serif';
                var primaryFont = fontStr.split(',')[0].replace(/^\\d+px\\s*"/, '').replace(/"$/, '').trim();
                var baseWidth = text.length * 7.2;
                if (primaryFont.indexOf('monospace') >= 0) return { width: text.length * 8.4 };
                if (primaryFont.indexOf('Arial') >= 0) return { width: baseWidth * 1.02 };
                if (primaryFont.indexOf('Times') >= 0) return { width: baseWidth * 0.96 };
                if (primaryFont.indexOf('Georgia') >= 0) return { width: baseWidth * 1.08 };
                if (primaryFont.indexOf('Verdana') >= 0) return { width: baseWidth * 1.15 };
                if (primaryFont.indexOf('Helvetica') >= 0) return { width: baseWidth * 1.03 };
                return { width: baseWidth };
            };
            ctx.getImageData = function(x,y,w,h) { return { width: w, height: h, data: new Uint8Array(w*h*4) }; };
            ctx.putImageData = function(){};
            ctx.isPointInPath = function(x, y, rule) { return rule === 'evenodd' ? true : false; };
            ctx.canvas = _canvas;
            return ctx;
        }
        if (type === 'webgl' || type === 'experimental-webgl') {
            return _createEnhancedWebGL();
        }
        return _orig_getContext(type);
    };
})();

// ----- WebGL 增强: 返回真实 GPU 参数 -----
function _createEnhancedWebGL() {
    var gl = {
        getParameter: function(pname) {
            if (pname === 0x1F00) return 'WebKit';                          // VENDOR
            if (pname === 0x1F01) return 'WebKit WebGL';                    // RENDERER
            if (pname === 0x1F02) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
            if (pname === 0x8B8C) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
            if (pname === 0x0D33) return 16384;                             // MAX_TEXTURE_SIZE
            if (pname === 0x0D3A) return new Int32Array([16384, 16384]);
            if (pname === 0x8869) return 16;                                // MAX_VERTEX_ATTRIBS
            if (pname === 0x9245) return FINAL_FP_CONFIG.webglVendor;       // UNMASKED_VENDOR
            if (pname === 0x9246) return FINAL_FP_CONFIG.webglRenderer;     // UNMASKED_RENDERER
            return null;
        },
        getExtension: function(name) {
            if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
            if (name === 'EXT_texture_filter_anisotropic' || name === 'WEBKIT_EXT_texture_filter_anisotropic' || name === 'MOZ_EXT_texture_filter_anisotropic') return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF };
            if (name === 'WEBGL_lose_context') return { loseContext: function(){}, restoreContext: function(){} };
            var exts = FINAL_FP_CONFIG.webglExtensions;
            if (exts && exts.indexOf(name) >= 0) return {};
            return null;
        },
        getSupportedExtensions: function() {
            return FINAL_FP_CONFIG.webglExtensions || [
                'ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_disjoint_timer_query',
                'EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_compression_bptc',
                'EXT_texture_compression_rgtc','EXT_texture_filter_anisotropic','EXT_sRGB',
                'OES_element_index_uint','OES_fbo_render_mipmap','OES_standard_derivatives','OES_texture_float',
                'OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear',
                'OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc',
                'WEBGL_compressed_texture_s3tc_srgb','WEBGL_debug_renderer_info','WEBGL_debug_shaders',
                'WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context','WEBGL_multi_draw'
            ];
        },
        getShaderPrecisionFormat: function() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
        getContextAttributes: function() { return { alpha: true, antialias: true, depth: true, stencil: false }; },
        createShader: function() { return {}; }, createProgram: function() { return {}; },
        shaderSource: function(){}, compileShader: function(){},
        attachShader: function(){}, linkProgram: function(){}, useProgram: function(){},
        createBuffer: function() { return {}; }, bindBuffer: function(){}, bufferData: function(){},
        getAttribLocation: function(){ return 0; }, getUniformLocation: function(){ return {}; },
        enableVertexAttribArray: function(){}, vertexAttribPointer: function(){},
        uniform2f: function(){}, drawArrays: function(){}, readPixels: function(){},
        clearColor: function(){}, clear: function(){}, enable: function(){}, depthFunc: function(){},
        isContextLost: function() { return false; }, getError: function() { return 0; },
        VENDOR: 0x1F00, RENDERER: 0x1F01, VERSION: 0x1F02,
        SHADING_LANGUAGE_VERSION: 0x8B8C, MAX_TEXTURE_SIZE: 0x0D33,
        MAX_VIEWPORT_DIMS: 0x0D3A, MAX_VERTEX_ATTRIBS: 0x8869,
        VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88E4, FLOAT: 0x1406, TRIANGLE_STRIP: 0x0005,
        RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, DEPTH_TEST: 0x0B71,
        LEQUAL: 0x0203, COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100
    };
    return gl;
}

// ----- Audio 增强: OfflineAudioContext (Audio 指纹需要) -----
(function() {
    var AudioParam = function AudioParam() {};
    AudioParam.prototype = {
        setValueAtTime: function(){},
        linearRampToValueAtTime: function(){},
        exponentialRampToValueAtTime: function(){},
    };

    var OscillatorNode = function OscillatorNode() {};
    OscillatorNode.prototype = {
        get type() { return this._type || 'triangle'; },
        set type(v) { this._type = v; },
        get frequency() { return this._freq || (this._freq = Object.create(AudioParam.prototype)); },
        connect: function(dest) { this._dest = dest; },
        disconnect: function(){},
        start: function(when){ this._started = true; },
        stop: function(when){},
    };

    var DynamicsCompressorNode = function DynamicsCompressorNode() {};
    DynamicsCompressorNode.prototype = {
        get threshold() { return this._thresh || (this._thresh = Object.create(AudioParam.prototype)); },
        get knee() { return this._knee || (this._knee = Object.create(AudioParam.prototype)); },
        get ratio() { return this._ratio || (this._ratio = Object.create(AudioParam.prototype)); },
        get attack() { return this._attack || (this._attack = Object.create(AudioParam.prototype)); },
        get release() { return this._rel || (this._rel = Object.create(AudioParam.prototype)); },
        get reduction() { return this._red || (this._red = Object.create(AudioParam.prototype)); },
        connect: function(dest) { this._dest = dest; },
        disconnect: function(){},
    };

    var AudioBuffer = function AudioBuffer() {};
    AudioBuffer.prototype = {
        getChannelData: function(channel) {
            if (FINAL_FP_CONFIG.audioRawSamples && FINAL_FP_CONFIG.audioRawSamples.length > 0) {
                if (FINAL_FP_CONFIG.audioRawSamples.length >= 5000) return new Float32Array(FINAL_FP_CONFIG.audioRawSamples);
                var waveform = [];
                for (var i = 0; i < 5000; i++) {
                    waveform.push(parseFloat((Math.sin(i * 0.1 + 100) * 0.05 + Math.cos(i * 0.07 + 50) * 0.03).toFixed(10)));
                }
                for (var j = 0; j < FINAL_FP_CONFIG.audioRawSamples.length && (4500 + j * 10) < 5000; j++) {
                    waveform[4500 + j * 10] = FINAL_FP_CONFIG.audioRawSamples[j];
                }
                return new Float32Array(waveform);
            }
            var samples = [];
            for (var i = 0; i < 5000; i++) {
                samples.push(parseFloat((Math.sin(i * 0.1 + 100) * 0.05 + Math.cos(i * 0.07 + 50) * 0.03).toFixed(10)));
            }
            return new Float32Array(samples);
        },
        get length() { return 5000; },
        get duration() { return 0.5; },
        get sampleRate() { return 44100; },
        get numberOfChannels() { return 1; },
    };

    window.OfflineAudioContext = function OfflineAudioContext(channels, length, sampleRate) {
        this._oncomplete = null;
    };
    window.OfflineAudioContext.prototype = {
        get sampleRate() { return 44100; },
        get length() { return 44100; },
        get destination() { return {}; },
        get currentTime() { return 0; },
        get oncomplete() { return this._oncomplete; },
        set oncomplete(fn) { this._oncomplete = fn; },
        createOscillator: function() {
            var osc = {}; osc.__proto__ = OscillatorNode.prototype; return osc;
        },
        createDynamicsCompressor: function() {
            var comp = {}; comp.__proto__ = DynamicsCompressorNode.prototype; return comp;
        },
        createGain: function() { return { gain: Object.create(AudioParam.prototype), connect: function(){}, disconnect: function(){} }; },
        createBiquadFilter: function() { return { type: 'lowpass', frequency: Object.create(AudioParam.prototype), connect: function(){}, disconnect: function(){} }; },
        startRendering: function() {
            var self = this;
            return new Promise(function(resolve) {
                Promise.resolve().then(function() {
                    var buffer = Object.create(AudioBuffer.prototype);
                    if (self._oncomplete) {
                        self._oncomplete({ renderedBuffer: buffer });
                    }
                    resolve(buffer);
                }, 0);
            });
        },
        resume: function() { return Promise.resolve(); },
        suspend: function() { return Promise.resolve(); },
        close: function() { return Promise.resolve(); },
    };
    window.webkitOfflineAudioContext = window.OfflineAudioContext;
    window.AudioContext = window.OfflineAudioContext;
})();

// ----- Canvas toDataURL 增强: 使用真实数据或兜底 -----
var _orig_canvas_toDataURL = _canvas.toDataURL;
_canvas.toDataURL = function() {
    if (FINAL_FP_CONFIG.canvasDataURL) return FINAL_FP_CONFIG.canvasDataURL;
    return _orig_canvas_toDataURL();
};

console.log('[fp_env_final] 指纹增强层已加载 (Canvas/WebGL/Audio)');
