# Paintable Palette (PS)（Photoshop CEP 调色盘插件）

在 Photoshop 内提供一个“可涂抹的调色盘面板”：用当前前景色在调色盘上混色，并可吸色回写到 Photoshop 前景色。支持 **RGB 线性混合** 与 **Mixbox 自然颜料混色** 两种模式。

> 当前仓库仅保留 **CEP（Legacy Extension）** 实现。

## 功能特性

- 调色盘画布（固定 300x300）
- 以 Photoshop 当前前景色作为笔刷颜色进行涂抹混色
- RGB 模式：常规 alpha blend 混色
- Mixbox 模式：颜料感混色（latent space 混合）
- 吸色：`Alt` 拖动或 `Pick` 模式，从调色盘取色并写回 Photoshop 前景色
- 清空：`Clear`
- 状态持久化：切换 tab/重载后恢复画布内容与模式

## 兼容性

- **CEP 版**：Legacy Extension（Photoshop 25.x 已验证可用，宿主行为与稳定性依版本而异）

## 安装与使用（CEP）

###  直接安装（已打包目录）

1. 退出 Photoshop
2. 复制目录：
   - `dist\\cep_zxp\\com.jinshihui.paintablepalette\\`（已签名解包目录）
3. 粘贴到 CEP 扩展目录：
   - `%APPDATA%\\Adobe\\CEP\\extensions\\com.jinshihui.paintablepalette\\`
   - 保持目录原样（包含 `mimetype` 与 `META-INF`）
   - 最终目录结构示例：
```text
%APPDATA%\\Adobe\\CEP\\extensions\
└─ com.jinshihui.paintablepalette\
   ├─ mimetype
   ├─ META-INF\
   │  └─ signatures.xml
   ├─ CSXS\
   │  └─ manifest.xml
   ├─ js\
   │  ├─ main.js
   │  ├─ styles.css
   │  └─ mixbox.js
   ├─ jsx\
   │  └─ photoshop.jsx
   └─ index.html
```
4. 启动 Photoshop，从 `窗口 > 扩展(旧版)` 打开面板
