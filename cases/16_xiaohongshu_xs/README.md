# 案例 16：小红书 x-s / shield — 内容平台签名族

> 📖 文档型案例（基于公开资料整理）。小红书的防护不是单个参数，而是
> **x-s / x-s-common / x-t / shield 的签名族**，且 Web 端与 App 端是两套体系。

## 背景

小红书 Web 端接口依赖 `x-s` 等请求头签名；App 端依赖 native 层 `shield` 签名
（`libshield.so`）。公开资料显示只逆向 `x-s` 仍可能挂——还需要
`x-s-common`、`x-xray-traceid`、`x-t`、`X-B3-*` 等配套参数。

## 两套体系

| 端 | 参数 | 保护形态 |
|----|------|---------|
| Web | x-s（旧）/ x-s-common + x-t 等（新） | JSVMP 虚拟化 + 原型链检测 |
| App | shield | native so（`libshield.so`），难度更高 |

公开资料中的 Web 端要点：

- x-s 新版本跑在 **JSVMP**（字节码 VM）上，解析 VM 文件、字节码指令后再还原算法
- 加密组合典型结构：虚拟化保护 + 对称加密（如 DES）+ 哈希（如 MD5）组合
- 有公开的开源项目专门分析 App 端 Shield 签名机制

## 逆向路线（公开资料总结）

1. **定位**：请求头全局搜索 `x-s` / `shield` → 断点定位生成函数
2. **解 VM**：JSVMP 需解析字节码（与案例 4 京东 h5st 的 VM 同类型问题）
3. **还原**：典型做法是 64 位整数转字节数组（Little Endian）这类基础变换层层拆解
4. **补环境兜底**：VM 分析成本高时改走「整段 JS 补环境执行」

## 本工具集的应用

- 补环境路线：`fp_env_patch.js` 作为签名 JS 的运行环境基座（同案例 15）
- JSVMP 字节码分析：参考 `spider research/JS逆向 tool` 与 js-reverse 手册的
  VM 分析方法论（操作码映射 → 反汇编 → 逐函数还原）

## 参考来源

- 小红书 x_s 参数逆向 2026 最新版（JSVMP 解析 + Node.js 执行）— https://blog.csdn.net/Chen__2024/article/details/159475014
- 小红书 shield 算法破解分析参数 — https://zhuanlan.zhihu.com/p/619834492
- 小红书数据采集 x-s-common、x-xray-traceid、x-t、X-B3 参数 — https://zhuanlan.zhihu.com/p/2050504727452989422
- Xiaohongshu Shield Algorithm（App 端开源分析）— https://github.com/RedNote/Xiaohongshu-Shield-Algorithm
- 逆向实战：小红书 X-S 参数（JSVMP + DES + MD5）— https://wenku.csdn.net/column/2ujngte1x79

## 状态

- [x] 机制文档（Web/App 双体系 + 签名族）
- [ ] 可运行代码（签名 JS 需按当前线上版本单独逆向，不在仓库内置）
