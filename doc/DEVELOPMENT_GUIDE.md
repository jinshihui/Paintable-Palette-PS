# Photoshop UXP 调色盘面板插件开发文档 (Mixbox Palette Panel)
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
*   **绘图/显示引擎**：**位图直出**（维护 `pixelBuffer`，通过 `ImageBlob(type:"image/uncompressed")` 刷新 `<img>`）。
*   **混色库**：[Mixbox](https://github.com/scrtwpns/mixbox) (CC BY-NC 4.0，非商业/学习用途)。
*   **PS 交互**：通过 Photoshop DOM API (`app.foregroundColor`) 读写颜色。

### 1.3 适用场景
*   需要自然色彩混合（如油画、水彩风格）的绘图辅助。
*   不喜欢 Photoshop 默认色板或取色器的艺术家。

---

## 2. 架构设计

### 2.1 模块划分
1.  **UI 层**：面板骨架、工具栏（笔刷大小、不透明度、硬度、模式切换、清空）、**Surface 容器（`<img>`）**。
2.  **输入层 (Input)**：监听 `pointerdown` / `pointermove` / `pointerup` 及键盘修饰键（Alt）。
3.  **PS 颜色桥接层 (Color Bridge)**：
    *   `getForegroundRGB()`: 读取 `app.foregroundColor`。
    *   `setForegroundRGB(rgb)`: 写入 `app.foregroundColor`。
4.  **笔刷引擎 (Brush Engine)**：
    *   **Stamp 机制**：将连续笔触转换为一系列圆形印章。
    *   **Dirty Rect（可选）**：后续可仅刷新受影响区域（当前实现先以全帧刷新为主，靠节流保证性能）。
5.  **混色引擎 (Mixing Engine)**：
    *   `blendRGB(dst, src, a)`: 标准线性插值。
    *   `blendMixbox(dst, src, a)`: 调用 Mixbox 库进行颜料模拟混合。
6.  **显示层 (Presenter)**：
    *   把 `pixelBuffer` 转为 `Uint8Array`，构造 `ImageBlob`，再 `URL.createObjectURL()` 刷新 `<img>.src`（并 `revokeObjectURL`）。

### 2.2 数据流
*   **涂抹 (Paint)**:
    `PointerMove` -> 读取 PS 前景色 -> 计算 Stamp 位置 -> **混色算法 (RGB/Mixbox)** 更新 `pixelBuffer/latentBuffer` -> `requestAnimationFrame` 节流刷新 `ImageBlob` -> 更新 `<img>`。
*   **吸色 (Pick)**:
    `Alt + Click/Drag` -> 读取 `pixelBuffer` 像素 -> `setForegroundRGB` -> 更新 PS 前景色。

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

#### 1a. 笔刷与显示（当前实现）
- 监听 `pointerdown`/`pointermove`/`pointerup` 事件 ✅
- 连续轨迹采样：相邻点距离 > `radius * 0.35` 时插入 stamp ✅
- 每个 stamp 更新 `pixelBuffer`（RGB 或 Mixbox 分支）✅
- 显示层：`pixelBuffer` → `ImageBlob(type:"image/uncompressed")` → `<img>`，并用 `requestAnimationFrame` 节流刷新 ✅
- **注意**：Photoshop UXP 的 `<canvas>` 能力受限（例如 `getImageData/putImageData` 可能不可用），本项目不再依赖 canvas 的像素 API

#### 1b. PS 前景色双向同步
- **读前景色**：`pointerdown` 时读 `app.foregroundColor.rgb`，缓存为笔刷色 ✅
- **吸色写入**：Alt+click 或 Pick 按钮模式，读 `pixelBuffer` → `executeAsModal()` 内写 `app.foregroundColor` ✅
- **关键**：写入前景色必须包裹在 `require("photoshop").core.executeAsModal()` 内

#### 1c. 交互逻辑
- **左键拖动**：涂抹（读前景色 → stamp 更新 buffer → 刷新 surface） ✅
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
| 越画越卡/Clear 无效   | UXP `<canvas>` 绘制命令可能累积           | 改为 `ImageBlob` 位图直出 + `<img>` 显示 ✅         |
| `ImageBlob` 构造报错  | 传参类型/格式不兼容                       | `new ImageBlob(Uint8Array, {type:"image/uncompressed", ...})` ✅ |
| Mixbox 覆盖 RGB 不融合 | RGB 只更新 `pixelBuffer`，`latentBuffer` 过期 | RGB 涂抹标记 `latent_dirty`，Mixbox 前按需同步 latent ✅ |

### Phase 2: 接入 Mixbox (Core Feature) 🔧 进行中

#### 2a. 引入 Mixbox 库 ✅
- [x] `npm install mixbox`，复制 `mixbox.js` 到 `lib/mixbox.js`
- [x] 在 `main.js` 中 `require("./lib/mixbox")` 加载库（路径基于 manifest 根）
- [x] 验证 `mixbox.lerp()` 基本调用无报错

#### 2b. Latent Buffer 混色架构 ✅
- [x] 新增 `latentBuffer` (Float64Array, W×H×7) 存储每像素的 Mixbox latent 值
- [x] `pixelBuffer` 保留用于吸色（从 latent 转回 RGB）
- [x] `drawStamp` 中根据 `colorMode` 分支：
  - **RGB 模式**：逐像素 alpha-blend 更新 `pixelBuffer` ✅
  - **Mixbox 模式**：逐像素 latent 混合 → 转回 RGB 写回 `pixelBuffer` ✅
- [x] `doClear` 时同步重置 `latentBuffer` 和 `pixelBuffer`

#### 2g. 打包与安装（CCX）✅
- [x] UDT 打包要求：manifest 里需配置 icons（包含 panel entrypoints 的 icons）
- [x] 增加图标资源：`assets/icon-23.png`、`assets/icon-46.png`、`assets/icon-48.png`、`assets/icon-96.png`
- [x] 已可通过 UDT 打包生成 `.ccx`
- [x] 命令行安装脚本：`mypackage/install_ccx.bat`（调用 UnifiedPluginInstallerAgent 安装 `.ccx`）

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

**已解决（方案选择）**：放弃 `<canvas>` 命令式绘制，改为 **`pixelBuffer` → `ImageBlob` → `<img>`** 的位图刷新链路。
- 结论：RGB/Mixbox 连续绘制均不再出现“下笔短时迟滞”或“长时间累计迟滞”，`Clear` 也能正常恢复状态。
- 关键实现要点：
  - `ImageBlob` 构造器入参使用 `Uint8Array`（而非 `ArrayBuffer`），并匹配 `image/uncompressed` 的尺寸/格式参数。
  - 用 `requestAnimationFrame` + 最小间隔节流刷新，避免高频生成对象 URL。
  - 每次刷新后 `URL.revokeObjectURL(lastUrl)`，避免内存累积。

#### 2f. ✅ 修复：RGB/Mixbox 跨模式不融合
**问题**：Mixbox 笔触覆盖到 RGB 模式的历史笔触时，出现边缘不融合（像两层材质无法混合），但 RGB 覆盖 Mixbox 不受影响。

**根因**：RGB 模式只更新 `pixelBuffer`，但 `latentBuffer` 没有对应更新；后续 Mixbox 混合仍以旧 latent（常为背景）作为底色。

**解决**：
- 新增 `latent_dirty` 标记：RGB 涂抹命中的像素置脏。
- Mixbox 更新该像素前：若脏，则先 `rgbToLatent(pixelBuffer)` 同步到 `latentBuffer`，再进行 Mixbox 混合。

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

### UXP Canvas（历史方案 / 受限）
```javascript
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d"); // 仅支持 2d
const imageData = ctx.getImageData(x, y, w, h);
// 像素操作...
ctx.putImageData(imageData, x, y);
```

> 注意：在 Photoshop UXP 环境中，`<canvas>` 能力受限，上述 `getImageData/putImageData` 可能不可用（本项目最终也不再依赖它们）。

### UXP ImageBlob（当前方案）
```javascript
// 以 RGB 8bit 为例：buffer 长度 = width * height * 3
const buffer = new Uint8Array(width * height * 3);

const blob = new ImageBlob(buffer, {
  type: "image/uncompressed",
  width,
  height,
  colorSpace: "RGB",
  pixelFormat: "RGB",
  components: 3,
  componentSize: 8,
  hasAlpha: false
});

const url = URL.createObjectURL(blob);
img.src = url;
// 记得 revoke 旧 url，避免内存增长
```

---

## 6. 注意事项
*   **Mixbox 许可**：Mixbox 使用 **CC BY-NC 4.0** 协议，仅限非商业用途。若需商用发布需联系作者授权。
*   **性能（显示层）**：`ImageBlob + <img>` 方案会频繁生成 object URL：务必 `revokeObjectURL`，并用 `requestAnimationFrame`/最小间隔节流刷新。
*   **性能（计算层）**：画布尺寸变大时，Mixbox 的逐像素计算会显著增加；必要时考虑 dirty rect、降采样（内部更小 buffer，显示拉伸）或降低 stamp 密度。
*   **一致性**：RGB 与 Mixbox 混用时，需保证 `pixelBuffer` 与 `latentBuffer` 同步策略一致（本项目通过 `latent_dirty` 修复跨模式不融合）。
*   **兼容性**：不同 PS/UXP 版本对 `ImageBlob(type:"image/uncompressed")` 的参数容忍度可能不同；遇到构造器异常优先检查入参类型（`Uint8Array`）与像素格式字段。
*   **内存**：如果以后要做“历史/撤销/多层”，不要无上限缓存整幅 `pixelBuffer` 快照；建议以小步增量或限制层数/分辨率。
*   **事件**：`<img>` 默认可拖拽，已禁用 `draggable`；若后续遇到触摸/手写笔问题，优先检查 `touch-action:none` 与指针坐标缩放。
*   **打包**：UDT 打包时若报 icons 缺失，需同时在 `manifest.json` 顶层与 panel entrypoints 内配置 `icons`。

---

## 7. 进度摘要（2026-02-11）
- 解决“越画越卡 / Clear 无效”的根因：放弃 `<canvas>` 命令式绘制，改为 `ImageBlob + <img>` 位图直出（RGB/Mixbox 均稳定）。
- 修复 RGB/Mixbox 跨模式不融合：引入 `latent_dirty`，Mixbox 混色前按需同步 latent。
- 完成打包与安装闭环：补齐 manifest icons、UDT 成功打包 `.ccx`，并提供 `mypackage/install_ccx.bat` 一键命令行安装。
- 当前默认笔刷不透明度：10%（便于混色，后续再根据手感调整 spacing/flow 策略）。

---

## 8. 迁移到 CEP（Legacy Extension）架构

> 背景：当前项目为 **UXP Panel**。你提出要“转移到 CEP 架构”，通常指 **CSXS/CEP HTML Extension + ExtendScript**（Photoshop 里常在 `Window > Extensions (Legacy)` 下出现）。

### 8.1 迁移目标（功能不变）
- 面板内“调色盘画布”可涂抹（半透明笔刷）。
- 笔刷颜色读取 Photoshop 当前前景色。
- Alt 按住吸色（或 Pick 按钮切换吸色模式），并写回 Photoshop 前景色。
- 混色模式可在 **RGB 线性混合** 与 **Mixbox** 之间切换。
- Clear 清空、Size/Opacity 控件保持可用。

### 8.2 CEP vs UXP：需要替换的关键点（调研结论）
- **宿主桥接**：
  - UXP：`require("photoshop")` + `executeAsModal()` 读写 `app.foregroundColor`
  - CEP：在面板 JS 里通过 `window.__adobe_cep__.evalScript(...)` 调 ExtendScript 读写 `app.foregroundColor`
- **显示层**：
  - UXP：`ImageBlob(type:"image/uncompressed") + <img>`（避免 UXP canvas 限制）
  - CEP：可直接用标准浏览器 `canvas`（本仓库已提供 CEP 版本用 `putImageData` 渲染）
- **调试方式**：
  - UXP：UXP Developer Tool
  - CEP：注册表开启 `PlayerDebugMode` + 通过 `Window > Extensions (Legacy)` 加载；DevTools 走 CEF remote debugging

### 8.3 本仓库当前的“最小 CEP 落地”（已加入的脚手架）
- CEP Manifest：`CSXS/manifest.xml`（入口指向 `cep/index.html`）
- CEP 面板实现：`cep/index.html` + `cep/main.js` + `cep/styles.css`
  - 画布渲染：`pixelBuffer(RGB)` → `canvas.putImageData`
  - PS 颜色桥接：`evalScript` 读/写 `app.foregroundColor`

### 8.4 建议的迁移步骤（保功能、低风险）
1) **双轨并行**：保留现有 UXP（便于随时对照行为），CEP 先做到可用闭环。
2) **先对齐桥接层**：确保 CEP 下 `get/set foregroundColor` 稳定（这是“功能不变”的关键）。
3) **再对齐渲染与交互**：Brush spacing、Opacity、Pick 行为与 UXP 一致。
4) **最后做打包发布**：确定 CEP 的分发方式（内部：debug mode 目录分发；公开：ZXP 签名）。

### 8.5 你需要配合我调试的具体步骤（Windows）

#### Step A：启用 CEP 开发模式并创建开发链接（一次性）
1) 关闭 Photoshop。
2) 以 PowerShell 运行（会写入注册表 + 创建 junction 到 CEP 扩展目录）：
   - `powershell -ExecutionPolicy Bypass -File debug\\cep_dev_setup.ps1`
3) 重启 Photoshop。

#### Step B：在 Photoshop 里打开面板
1) 菜单：`Window > Extensions (Legacy) > Mixbox Palette (CEP)`
2) 在面板里随便涂几笔，确认：
   - RGB/Mixbox 切换可用
   - Alt 吸色写回前景色（或点 Pick）

#### Step C：打开 DevTools（给我报错/日志用）
1) 确保 `CSXS/manifest.xml` 里有 `--remote-debugging-port=9222`
2) 用 Edge/Chrome 打开：`http://127.0.0.1:9222`
3) 找到对应扩展页面并 Inspect，复制 Console 报错发我（或截图）

### 8.6 发布（CEP 典型路径，需你确认的决策点）
- **内部/自用分发（最快）**：让用户启用 `PlayerDebugMode`，把扩展目录（或压缩包解压）放到 `%APPDATA%\\Adobe\\CEP\\extensions\\...`。
- **签名分发（更正规）**：使用 Adobe `ZXPSignCmd` 生成 `.zxp`（需要证书 `.p12`）；安装依赖目标机器的 CEP 安装器/策略。

> 你需要告诉我：你期望的发布形态是“内部自用”还是“签名 ZXP”，以及目标 Photoshop 版本范围（例如 PS 2022/2023/2024/2025）。
