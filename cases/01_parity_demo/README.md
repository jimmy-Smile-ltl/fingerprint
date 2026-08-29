# 案例 1：报告注入 → Node 输出与浏览器一致性验证

**自包含 demo，无需任何真实目标站点**，演示本工具集的核心闭环：

```
真实浏览器 (test_fp.html 采集) ──┐
                                 ├──> 浏览器报告 (visitorId + components)
Node.js 补环境 (fp_env_patch) ───┘
                                 ↓
                     injectRealFingerprint(report)
                                 ↓
                 Node 重新计算各维度 → visitorId
                                 ↓
                    两者一致 = 注入生效 ✅
```

## 文件

| 文件 | 说明 |
|------|------|
| `demo_inject.cjs` | 主脚本：加载补环境 → 注入报告 → 重新计算 → 对比 visitorId |
| `sample_report.json` | 示例报告。**注意：由 Node 默认环境生成，仅演示流程格式**，请用 `test_fp.html` 采集你自己的真实报告替换 |

## 运行

```bash
# 在仓库根目录
npm install
node cases/01_parity_demo/demo_inject.cjs
```

预期输出：

```
  报告中的 visitorId: 163337c272489f4d95431df2808ce9b9
  注入后 Node 输出:   163337c272489f4d95431df2808ce9b9

  ✅ 一致! 注入生效 — Node 输出与报告完全相同
```

## 用真实浏览器报告替换

1. 仓库根目录起服务：`python -m http.server 8080`
2. 打开 `http://localhost:8080/test_fp.html`，点「📋 复制报告 JSON」
3. 覆盖 `sample_report.json` 内容（**勿提交**，已 gitignore）

## 已知边界（真实报告场景）

| 维度 | 自动注入 | 说明 |
|------|---------|------|
| Canvas / WebGL / Audio / 硬件 / 时区 | ✅ | 报告字段与 `injectRealFingerprint` 一一对应 |
| 字体 | ⚠️ 需手动 | 报告只有「已安装字体列表」，不含逐字体宽度。精确复现需手动：`setFingerprintConfig({ fontWidthsRaw: { "Arial": 89.5, ... } })` |
