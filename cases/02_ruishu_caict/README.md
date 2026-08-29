# 案例 2：瑞数 WAF 端到端研究流程

> ⚠️ 研究用途。目标站点仅为公开演示对象，请遵守相关法律法规与站点条款。

## 背景

瑞数（Riversecurity）WAF 使用「动态令牌 + JS 虚拟机（JSVMP）」校验浏览器环境与 Cookie 完整性：
首次访问返回 412 与一段 VM 脚本，浏览器执行后生成 P cookie，携带 O+P cookie 才能通过校验。

本案例演示用指纹补环境在 Node.js 中替代浏览器执行这段 VM。

## 流程

```
1. GET 目标页 → 412 + O cookie + meta content + $_ts 脚本 + VM URL
2. 下载 VM 代码
3. 拼装: fp_env_patch.js + 瑞数补丁 + $_ts + VM + get_cookie()
4. node 子进程执行 → 提取 P cookie
5. curl_cffi (chrome110) 携带 O+P cookie 验证
```

## 运行

```bash
pip install requests curl_cffi
python test_e2e_ruishu.py            # 默认: fp_env_patch.js + 瑞数补丁
python test_e2e_ruishu.py --compare  # 与基准环境对比
python test_e2e_ruishu.py --env fp_env_ruishu_plus.js
```

## 关键实现点

| 环节 | 说明 |
|------|------|
| 参数提取 | meta content / $_ts / VM URL 全部**动态提取**（瑞数路径会轮换，不硬编码） |
| Cookie 存储 | `document.cookie` 按 name 追加/更新（真实语义，支持多 cookie 顺序写入） |
| 环境对齐 | `document.body/head/documentElement` 可写、`createElement('script')` 返回元素对象、Timer 立即执行 |
| TLS 指纹 | 验证阶段用 curl_cffi `impersonate="chrome110"` 对齐浏览器 TLS 指纹 |

## 状态

- P cookie 生成成功（长度/格式正确），验证结果见各环境运行输出
- 基准环境（`run_js_proto.js`，位于其他项目）已验证通过，本仓库 env 与基准的
  属性差异对比是定位剩余差异的主要手段

## 踩坑记录

- `document.body` 等 accessor 只有 getter 时，sloppy mode 下赋值被静默丢弃 → 补环境必须提供 setter
- `createElement('script')` 返回字符串会让所有脚本加载逻辑静默失效 → 必须返回元素对象
- 瑞数先写标记 cookie 再写 P cookie，cookie setter 若整体覆盖只会留下最后一个
- 环境与真实浏览器的差异（Canvas/WebGL/Navigator 属性）会让 VM 走不同分支产生不同 cookie
