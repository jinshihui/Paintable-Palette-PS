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

### Phase 0: 环境与骨架 ✅ 已完成
- [x] 初始化项目结构 (`manifest.json`, `index.html`, `main.js`)。
- [x] 配置 `package.json` 及基础开发工具。
- [x] 验证 UDT 能成功加载并显示面板。

### Phase 1: 基础调色盘闭环 (MVP) ✅ 已完成

#### 1a. Canvas 笔刷（arc-based）
- 监听 `pointerdown`/`pointermove`/`pointerup` 事件 ✅
- 连续轨迹采样：相邻点距离 > `radius * 0.35` 时插入 stamp ✅
- 每个 stamp 用 `ctx.arc()` + `ctx.fill()` + `globalAlpha` 绘制 ✅
- **注意**：UXP Canvas 不支持 `getImageData`/`putImageData`，因此用 `pixelBuffer` (Uint8Array) 在 JS 侧追踪像素颜色

#### 1b. PS 前景色双向同步
- **读前景色**：`pointerdown` 时读 `app.foregroundColor.rgb`，缓存为笔刷色 ✅
- **吸色写入**：Alt+click 或 Pick 按钮模式，读 `pixelBuffer` → `executeAsModal()` 内写 `app.foregroundColor` ✅
- **关键**：写入前景色必须包裹在 `require("photoshop").core.executeAsModal()` 内

#### 1c. 交互逻辑
- **左键拖动**：涂抹（读前景色 → arc stamp） ✅
- **Alt + 左键** 或 **Pick 按钮**：吸色模式 ✅
- **Clear 按钮**：清空画布 + 重置 pixelBuffer ✅

#### 1d. 验收结果
- [x] 连续拖动涂抹顺滑（300×300 buffer）
- [x] 笔刷颜色来自 PS 前景色（改前景色后下一笔生效）
- [x] Alt 吸色后 PS 前景色立即更新（`executeAsModal`）
- [x] Clear 清空无残留

#### 1e. 踩坑记录
| 问题                  | 原因                                      | 解决方案                                           |
| --------------------- | ----------------------------------------- | -------------------------------------------------- |
| CSS/JS 文件加载失败   | UXP 相对路径基于 `manifest.json` 所在目录 | HTML 内路径加 `src/` 前缀                          |
| `plugin: {}` 报错     | UXP 要求 plugin 对象必须有 `create` 方法  | 补上 `create`/`destroy`                            |
| Canvas 不可见         | UXP 不支持 CSS flex 撑开 canvas           | 用内联 `style` + HTML `width`/`height` 属性        |
| `getImageData` 不可用 | UXP Canvas 仅支持基本形状 API             | 用 `arc()`+`fill()` 画笔刷，`pixelBuffer` 追踪颜色 |
| 设置前景色失败        | 修改 PS 状态需 modal scope                | 用 `executeAsModal()` 包裹                         |
| Alt keydown 不触发    | PS 拦截了 Alt 键                          | 读 `e.altKey` + Pick 按钮后备                      |

### Phase 2: 接入 Mixbox (Core Feature) 🔧 进行中

#### 2a. 引入 Mixbox 库 ✅
- [x] `npm install mixbox`，复制 `mixbox.js` 到 `lib/mixbox.js`
- [x] 在 `main.js` 中 `require("./lib/mixbox")` 加载库（路径基于 manifest 根）
- [x] 验证 `mixbox.lerp()` 基本调用无报错

#### 2b. Latent Buffer 混色架构 ✅
- [x] 新增 `latentBuffer` (Float64Array, W×H×7) 存储每像素的 Mixbox latent 值
- [x] `pixelBuffer` 保留用于吸色（从 latent 转回 RGB）
- [x] `drawStamp` 中根据 `colorMode` 分支：
  - **RGB 模式**：canvas 原生 `arc()` alpha-blend + `pixelBuffer` 同步 ✅
  - **Mixbox 模式**：逐像素 latent 混合 → 转回 RGB → scanline 渲染到 canvas ✅
- [x] `doClear` 时同步重置 `latentBuffer` 和 `pixelBuffer`

#### 2c. UI 模式切换 ✅
- [x] `#select-mode` select 绑定事件，切换 `colorMode`（"rgb" / "mixbox"）
- [x] 状态栏显示当前模式

#### 2d. 验收结果
- [x] Mixbox 模式下黄+蓝 → 绿色调 ✅（WYSIWYG，canvas=吸色结果）
- [x] RGB 模式下黄+蓝 → 灰色调 ✅
- [x] 切换模式不影响 RGB 模式性能 ✅
- [x] 吸色功能在两种模式下均正常 ✅

#### 2e. 🚧 待解决：Mixbox 渲染性能
**问题**：Mixbox 模式下笔刷不够丝滑，且越画越迟滞。

**已尝试方案**：

| 方案                  | 描述                           | 性能                    | 渲染质量               |
| --------------------- | ------------------------------ | ----------------------- | ---------------------- |
| ① 逐像素 `fillRect`   | 每像素 1 次 fillRect           | ❌ 极慢（~1257次/stamp） | ✅ 完美 WYSIWYG         |
| ② 单次 `arc` 中心色   | 取中心像素结果色，alpha=1.0    | ✅ 极快                  | ⚠️ 不透明感，但 WYSIWYG |
| ③ 半透明 `arc` 笔刷色 | 与 RGB 模式相同渲染            | ✅ 极快                  | ❌ canvas≠吸色结果      |
| ④ scanline 逐行渲染   | 每行 1 次 fillRect（当前方案） | ⚠️ 尚可但越画越慢        | ✅ 近似 WYSIWYG         |

**"越画越慢"根因**：UXP canvas 大量 `fillRect` 调用导致内部绘制命令累积。

**下一步优化方向**：
- 考虑 `requestAnimationFrame` 合并渲染（减少即时调用次数）
- 考虑降低 stamp 间距（减少每帧 stamp 数量）
- 考虑使用 dirty flag + 延迟批量刷新整个 canvas
- 考虑 off-screen canvas 或其他 UXP 支持的图像 API

### Phase 3: 优化与完善 (Polish)
- [ ] **性能优化**：Mixbox 渲染性能（最高优先级）
- [ ] **性能优化**：`requestAnimationFrame` 节流
- [ ] **UI 完善**：添加笔刷参数控制（大小、不透明度、硬度 slider）
- [ ] **功能增强**：保存/加载调色盘 (Save/Load)

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
