# Paintable Palette 调色盘插件 (PS)

English: `README_EN.md`

在 Photoshop 内提供一个“可涂抹的调色盘面板”：用当前前景色在调色盘上混色，并可吸色回写到 Photoshop 前景色。

![alt text](00assets/image-3.png)

> 当前仓库仅保留 **CEP（Legacy Extension）** 实现。

## Releases（两个版本）

本项目在 GitHub Releases 提供两个可安装的 zip：

- **RGB-only（可商用）**：仅包含 RGB 线性混合，不包含 Mixbox。
![alt text](00assets/image.png)
- **Mixbox-NC（仅非商用）**：包含 Mixbox 自然颜料混色。由于 Mixbox 许可为 **CC BY-NC 4.0**，该版本 **仅限非商业用途**。
![alt text](00assets/image-1.png)
> 两个版本使用同一个扩展 ID（`com.jinshihui.paintablepalette`），不能同时安装；请二选一。

## 功能特性

- 调色盘画布（固定 300x300）
- 以 Photoshop 当前前景色作为笔刷颜色进行涂抹混色
- RGB-only：常规 alpha blend 混色
- Mixbox-NC：颜料感混色（latent space 混合）
- 吸色：`Alt` 拖动或 `Pick` 模式，从调色盘取色并写回 Photoshop 前景色
- 清空：`Clear`
- 状态持久化：切换 tab/重载后恢复画布内容与模式

## 兼容性

- **CEP 版**：Legacy Extension（Photoshop 25.x 已验证可用，宿主行为与稳定性依版本而异）

## 仓库内容（源码）

本仓库源码为 **RGB-only** 版本，对应目录：

- `cep_ext/rgb_only/com.jinshihui.paintablepalette/`

仓库中不包含 Mixbox 代码；Mixbox-NC 版本仅以 Release zip 方式提供。

## 安装与使用（CEP）

### 方式 A：从 Releases 安装（推荐）

1. 退出 Photoshop
2. 下载并解压对应版本的 Release zip
3. 将解压出来的扩展目录（`com.jinshihui.paintablepalette`）复制到 CEP 扩展目录：
   - Windows：`%APPDATA%\Adobe\CEP\extensions\com.jinshihui.paintablepalette\`
   - macOS：`~/Library/Application Support/Adobe/CEP/extensions/com.jinshihui.paintablepalette/`
4. 启动 Photoshop，从 `窗口 > 扩展(旧版)` 打开面板

> 若解压后的目录名带有后缀（例如 `com.jinshihui.paintablepalette_RGB` / `com.jinshihui.paintablepalette_Mixbox`），请先重命名为 `com.jinshihui.paintablepalette` 再复制安装。

> 若你解压得到的目录中包含 `mimetype` 与 `META-INF/signatures.xml`，请保持目录结构原样不要丢失。

目录结构示例：
```text
%APPDATA%\Adobe\CEP\extensions\
└─ com.jinshihui.paintablepalette\
   ├─ mimetype
   ├─ META-INF\
   │  └─ signatures.xml
   ├─ CSXS\
   │  └─ manifest.xml
   ├─ js\
   │  ├─ main.js
   │  └─ styles.css
   ├─ jsx\
   │  └─ photoshop.jsx
   └─ index.html
```

### 方式 B：从源码安装（仅 RGB-only，开发用）

将 `cep_ext/rgb_only/com.jinshihui.paintablepalette/` 复制到 CEP 扩展目录（见上文）。

说明：源码目录通常不包含签名信息，部分宿主环境可能需要开启 CEP 调试模式（`PlayerDebugMode=1`）才能加载未签名扩展。

## Mixbox-NC 的限制（务必阅读）

Mixbox-NC 版本包含 Mixbox（Secret Weapons），其许可为 **CC BY-NC 4.0（仅非商用）**：

- 任何包含 Mixbox 的版本均 **不得用于商业用途**
- 如需商用，请联系 Mixbox 作者获取商用授权（上游仓库：`https://github.com/scrtwpns/mixbox`）

更多第三方声明见：`THIRD_PARTY_NOTICES.md`
