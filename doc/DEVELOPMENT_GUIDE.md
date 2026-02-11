# Photoshop UXP 调色盘面板插件开发文档 (Mixbox Palette Panel)

本文档整合了原有的 `palette_plugin.md` 和 `palette_plugin2.md`，作为本项目的权威开发指南。

---

## 1. 项目概述

### 1.1 目标
在 Photoshop 内构建一个独立的“调色盘面板（Palette Panel）”，提供类似传统画板的混色体验：
*   **功能**：像小画布一样用半透明笔刷“涂抹调色盘”。
*   **颜色源**：笔刷颜色实时读取 **Photoshop 当前前景色**。
*   **吸色**：按住 **Alt** 在调色盘上吸色，并立即同步回 Photoshop 前景色。
*   **核心特性**：混色算法支持在 **RGB 线性混合** 与 **Mixbox 自然颜料混色** 之间切换。

### 1.2 技术选型
*   **插件架构**：**Adobe UXP Panel**（纯前端技术栈）。
*   **语言**：JavaScript + HTML + CSS。
*   **绘图引擎**：HTML5 `<canvas>` (2D Context)。
*   **混色库**：[Mixbox](https://github.com/scrtwpns/mixbox) (CC BY-NC 4.0，非商业/学习用途)。
*   **PS 交互**：通过 Photoshop DOM API (`app.foregroundColor`) 读写颜色。

### 1.3 适用场景
*   需要自然色彩混合（如油画、水彩风格）的绘图辅助。
*   不喜欢 Photoshop 默认色板或取色器的艺术家。

---

## 2. 架构设计

### 2.1 模块划分
1.  **UI 层**：面板骨架、工具栏（笔刷大小、不透明度、硬度、模式切换、清空）、Canvas 容器。
2.  **输入层 (Input)**：监听 `pointerdown` / `pointermove` / `pointerup` 及键盘修饰键（Alt）。
3.  **PS 颜色桥接层 (Color Bridge)**：
    *   `getForegroundRGB()`: 读取 `app.foregroundColor`。
    *   `setForegroundRGB(rgb)`: 写入 `app.foregroundColor`。
4.  **笔刷引擎 (Brush Engine)**：
    *   **Stamp 机制**：将连续笔触转换为一系列圆形印章。
    *   **Dirty Rect**：仅更新受影响的局部区域（Bounding Box）以优化性能。
5.  **混色引擎 (Mixing Engine)**：
    *   `blendRGB(dst, src, a)`: 标准线性插值。
    *   `blendMixbox(dst, src, a)`: 调用 Mixbox 库进行颜料模拟混合。

### 2.2 数据流
*   **涂抹 (Paint)**:
    `PointerMove` -> 读取 PS 前景色 -> 计算 Stamp 位置 -> 读取 Canvas 局部像素 -> **混色算法 (RGB/Mixbox)** -> 写入 Canvas。
*   **吸色 (Pick)**:
    `Alt + Click/Drag` -> 读取 Canvas 像素 -> `setForegroundRGB` -> 更新 PS 前景色。

---

## 3. 开发环境配置

### 3.1 必备软件
1.  **Adobe Photoshop 2022+** (支持 UXP Manifest v5)。
2.  **Adobe UXP Developer Tool (UDT)**: 用于加载、调试和打包插件。
    *   *安装方式*：通过 Creative Cloud Desktop 安装。
    *   *权限*：需要管理员权限以启用 Developer Mode。
3.  **Node.js**:用于管理开发依赖（如 ESLint）。

### 3.2 推荐环境
*   **编辑器**: VS Code 或 Cursor。
*   **包管理器**: `npm` 或 `uv` (本项目使用 `uv` 管理 Python 环境，前端依赖用 `npm`)。

### 3.3 UDT 初始化步骤
1.  启动 UXP Developer Tool。
2.  开启 **Developer Mode**。
3.  点击 **Add Plugin**，选择本项目的 `manifest.json` 所在目录。
4.  点击 **Load** 将插件加载到 Photoshop 中。
5.  点击 **Debug** 打开调试控制台 (DevTools)。

---

## 4. 开发计划 (Milestones)

### Phase 0: 环境与骨架 (Environment & Skeleton)
- [ ] 初始化项目结构 (`manifest.json`, `index.html`, `main.js`)。
- [ ] 配置 `package.json` 及基础开发工具。
- [ ] 验证 UDT 能成功加载并显示 "Hello World" 面板。

### Phase 1: 基础调色盘闭环 (MVP)
- [ ] 实现 Canvas 基础绘图（Stamp 笔刷）。
- [ ] 实现 Photoshop 前景色双向同步（读前景色绘图，Alt 吸色写回前景色）。
- [ ] 验证 RGB 模式下的混色与吸色流程。

### Phase 2: 接入 Mixbox (Core Feature)
- [ ] 引入 `mixbox.js` 库。
- [ ] 实现混色模式切换 (RGB <-> Mixbox)。
- [ ] 验证 Mixbox 模式下的颜料混合效果（如黄+蓝=绿）。

### Phase 3: 优化与完善 (Polish)
- [ ] **性能优化**：实现 Dirty Rect 更新与 `requestAnimationFrame` 节流。
- [ ] **UI 完善**：添加笔刷参数控制（大小、不透明度、硬度）。
- [ ] **功能增强**：清空画布 (Clear)、保存/加载调色盘 (Save/Load)。

---

## 5. 关键 API 参考

### Photoshop DOM
```javascript
const app = require('photoshop').app;

// 读取前景色
const fgColor = app.foregroundColor; // SolidColor 对象
const rgb = fgColor.rgb; // { red: 255, green: 0, blue: 0 }

// 写入前景色
const newColor = new app.SolidColor();
newColor.rgb.red = 255;
newColor.rgb.green = 128;
newColor.rgb.blue = 0;
app.foregroundColor = newColor;
```

### UXP Canvas
```javascript
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d"); // 仅支持 2d
const imageData = ctx.getImageData(x, y, w, h);
// 像素操作...
ctx.putImageData(imageData, x, y);
```

---

## 6. 注意事项
*   **Mixbox 许可**：Mixbox 使用 **CC BY-NC 4.0** 协议，仅限非商业用途。若需商用发布需联系作者授权。
*   **性能**：避免在 `pointermove` 中全屏 `putImageData`，必须使用局部更新。
