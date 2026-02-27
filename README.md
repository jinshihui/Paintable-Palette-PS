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

## 安装与使用（CEP 版）

把已签名扩展的“解包文件夹”手动复制到 CEP 扩展目录即可。

1. 退出 Photoshop
2. 复制本项目中的目录：
   - `dist\\cep_zxp\\com.jinshihui.paintablepalette\\`
3. 粘贴到你的 CEP 扩展目录（保持文件夹名不变）：
   - `%APPDATA%\\Adobe\\CEP\\extensions\\com.jinshihui.paintablepalette\\`
4. 启动 Photoshop，在菜单打开：
   - `窗口 > 扩展(旧版) > PaintablePalette (CEP)`
