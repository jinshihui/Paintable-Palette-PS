# Paintable Palette (PS)（Photoshop 调色盘插件）

在 Photoshop 内提供一个“可涂抹的调色盘面板”：用当前前景色在调色盘上混色、并可吸色回写到 Photoshop 前景色。支持 **RGB 线性混合** 与 **Mixbox 自然颜料混色** 两种模式。

> 本仓库同时包含 **UXP 版（现代，推荐）** 与 **CEP 版（Legacy）**。两者功能基本等价，但 CEP 在 Photoshop 25.x 下可能在选项卡切换时被宿主重载（我们已做状态持久化以避免清空）。

## 功能特性

- 调色盘画布（固定 300×300）
- 以 Photoshop 当前前景色作为笔刷颜色进行涂抹混色
- RGB 模式：常规 alpha blend 混色
- Mixbox 模式：颜料感混色（latent space 混合）
- 吸色：`Alt` 拖动或 `Pick` 模式，从调色盘取色并写回 Photoshop 前景色
- 清空：`Clear`
- CEP 版支持状态持久化：切换 tab/重载后恢复画布内容与模式

## 兼容性

- **UXP 版**：Photoshop 2022+（manifest v5），本仓库 manifest 设置 `minVersion: 23.3.0`
- **CEP 版**：Legacy Extension（Photoshop 25.x 仍可用，但宿主行为与稳定性依版本而异）

## 安装与使用（UXP 版，推荐）

### A. 开发/调试安装（UDT）

1. 安装并打开 Adobe UXP Developer Tool（UDT），开启 Developer Mode
2. 在 UDT 里 `Add Plugin` 选择本仓库根目录（包含 `manifest.json` 的目录）
3. `Load` 后打开 Photoshop
4. 在 Photoshop 菜单里打开面板（通常在 `窗口 > 扩展(UXP)` 一类入口，视版本而定）

### B. 打包/安装（CCX）

仓库内包含一个示例安装脚本：

- 运行：`mypackage\\install_ccx.bat`

该脚本会调用 `UnifiedPluginInstallerAgent` 安装同目录下的 `.ccx` 包。安装后如 Photoshop 正在运行，需要重启后在扩展列表中查看。

### 使用方式

- **涂抹**：在调色盘上按下并拖动（笔刷颜色读取 Photoshop 当前前景色）
- **吸色**：按住 `Alt` 点击/拖动，或点击 `Pick` 切换到吸色模式
- **切换混色**：选择 `RGB` / `Mixbox`
- **清空**：`Clear`

## 安装与使用（CEP 版，Legacy）

### A. 开发态安装（Windows）

1. 开启 CEP 调试模式（未签名扩展需要）：
   - 注册表：`HKCU\\Software\\Adobe\\CSXS.11` 下 `PlayerDebugMode` 设为字符串 `1`
2. 把扩展目录放到：
   - `%APPDATA%\\Adobe\\CEP\\extensions\\com.jinshihui.paintablepalette\\`
3. 推荐用同步脚本（避免手动复制）：
   - `powershell -ExecutionPolicy Bypass -File .\\sync_cep_extension.ps1`
4. 重启 Photoshop
5. 在 Photoshop 打开：
   - `窗口 > 扩展(旧版) > PaintablePalette (CEP)`

### B. DevTools 调试

1. 重启 Photoshop 并打开面板后访问：
   - `http://127.0.0.1:8088`
2. 在列表中找到面板页面进入 DevTools

> 已知现象：在某些 Photoshop 版本/布局下，CEP 面板与同组选项卡切换会被宿主销毁重建，DevTools 连接会断开，需要重新打开 8088。

### C. 分发（可选）

- 直接把 `cep_ext/com.jinshihui.paintablepalette/` 作为扩展目录分发（可自行压缩为 zip）。
- 对外分发通常不需要 `.debug`（避免暴露调试端口）；内部调试分发可保留。

### D. 签名打包分发（ZXP，无需改注册表）

未签名 CEP 扩展通常需要开启 `PlayerDebugMode`（Windows 要改注册表）。如果你希望“发给用户即装即用”，推荐走 **ZXP 签名打包**：

1. 安装 Adobe Extension Signing Toolkit（拿到 `ZXPSignCmd.exe`）。
2. 在 PowerShell 里设置工具路径（示例）：
   - `$env:ZXPSIGNCMD_PATH = "C:\\path\\to\\ZXPSignCmd.exe"`
3. 生成一个自签名证书（示例输出到 `CEP_package_tools/certs/`）：
   - `powershell -ExecutionPolicy Bypass -File .\\CEP_package_tools\\create_cep_self_signed_cert.ps1 -out_p12_path .\\CEP_package_tools\\certs\\cep_self_signed.p12`
4. 生成已签名的 `.zxp`：
   - `powershell -ExecutionPolicy Bypass -File .\\CEP_package_tools\\package_cep_zxp.ps1 -cert_p12_path .\\CEP_package_tools\\certs\\cep_self_signed.p12`
5. 验签（可选）：
   - `"C:\\path\\to\\ZXPSignCmd.exe" -verify ".\\dist\\cep_zxp\\<extension_id>-<timestamp>.zxp"`
6. 安装（推荐使用 Adobe 的安装器工具，如 `UnifiedPluginInstallerAgent` 或 `ExManCmd` 安装 `.zxp`）。

## 目录结构（速览）

- `src/`：UXP 面板实现（入口 `src/index.html`）
- `manifest.json`：UXP manifest（v5）
- `lib/mixbox.js`：Mixbox 库（用于 Mixbox 模式）
- `mypackage/`：UXP `.ccx` 与安装脚本
- `cep_ext/com.jinshihui.paintablepalette/`：CEP 扩展实现
- `sync_cep_extension.ps1`：CEP 开发态同步到 `extensions` 目录
- `CEP_package_tools/create_cep_self_signed_cert.ps1`：生成 CEP 自签名证书（`.p12`）
- `CEP_package_tools/package_cep_zxp.ps1`：CEP 扩展签名打包为 `.zxp`
- `doc/DEVELOPMENT_GUIDE.md`：实现细节与开发记录

## 常见问题

### 1) CEP 切换同组选项卡会重载/卡顿

这是宿主（Photoshop）对 Legacy Extension 的管理策略导致，CEP 侧通常无法保证“切 tab 不重载”。本仓库 CEP 版已实现 IndexedDB 状态持久化，尽量做到“重载不清空”。

### 2) Mixbox 许可

Mixbox 使用 **CC BY-NC 4.0**（非商业用途）。若计划商用发布，请先确认许可与授权策略。
