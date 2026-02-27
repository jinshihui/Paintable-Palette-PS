# Photoshop CEP 调色盘面板插件开发文档 (PaintablePalette)

## 1. 项目概述

### 1.1 目标
在 Photoshop 中提供一个可涂抹的调色盘面板：
- 使用 Photoshop 当前前景色作为笔刷色进行涂抹混色。
- 支持 `RGB` 与 `Mixbox` 两种混色模式。
- 支持吸色并写回 Photoshop 前景色。
- 在 CEP 面板被宿主重建后恢复画布与参数状态。

### 1.2 技术选型
- 插件架构：CEP (Legacy Extension)
- 前端：JavaScript + HTML + CSS
- 绘制：`<canvas>` + `ImageData` 像素缓冲
- 宿主桥接：`window.__adobe_cep__.evalScript(...)` + ExtendScript
- 混色库：Mixbox（`lib/mixbox.js` 同步到 CEP 包内）

### 1.3 目录结构
- CEP 扩展根目录：`cep_ext/com.jinshihui.paintablepalette/`
  - `CSXS/manifest.xml`：CEP 清单
  - `index.html`：面板页面
  - `js/main.js`：面板主逻辑（绘制、吸色、状态持久化）
  - `js/styles.css`：面板样式
  - `js/mixbox.js`：Mixbox 库（由同步脚本复制）
  - `jsx/photoshop.jsx`：ExtendScript 桥接（读写前景色）
  - `.debug`：本地 DevTools 端口配置

---

## 2. 开发环境配置

### 2.1 必备软件
1. Adobe Photoshop（支持 CEP 扩展）
2. Node.js（用于本仓库脚本与依赖）
3. PowerShell（运行同步与打包脚本）

### 2.2 开发态安装（Windows）
1. 开启 CEP 调试模式：
   - 注册表：`HKCU\Software\Adobe\CSXS.11`
   - 新建字符串值：`PlayerDebugMode = 1`
2. 执行同步脚本：
   - `powershell -ExecutionPolicy Bypass -File .\sync_cep_extension.ps1`
3. 启动 Photoshop，在菜单打开：
   - `窗口 > 扩展(旧版) > PaintablePalette (CEP)`

### 2.3 DevTools 调试
1. 确保扩展目录内有 `.debug` 文件。
2. 打开面板后访问 `http://127.0.0.1:8088`。
3. 选择对应面板进入调试。

---

## 3. 开发过程（Milestones）

### Phase 0：骨架搭建
- 建立 CEP 清单 `CSXS/manifest.xml`，定义面板入口与尺寸。
- 完成 `index.html + js/main.js + jsx/photoshop.jsx` 最小闭环。
- 验证能在 `窗口 > 扩展(旧版)` 打开面板。

### Phase 1：基础绘制闭环 (MVP)
- 以 `canvas` 像素缓冲作为单一真值源：
  - `pixel_buffer`（RGBA）用于显示与吸色。
- 实现 `pointerdown / pointermove / pointerup`：
  - 连续轨迹按间距采样为 stamp，避免断笔。
- 实现基础工具：
  - `Clear` 清空画布
  - `Pick` 模式与 `Alt` 临时吸色

### Phase 2：Photoshop 前景色双向同步
- JS -> PS：
  - 调用 `paintablepalette_setForegroundRGB(r,g,b)` 写入前景色。
- PS -> JS：
  - 调用 `paintablepalette_getForegroundRGB()` 读取当前前景色。
- 约束：
  - `evalScript` 返回值统一按字符串处理并做显式错误分支。

### Phase 3：接入 Mixbox 混色
- 引入 `mixbox.js`，支持 `RGB`/`Mixbox` 模式切换。
- 增加 `latent_buffer` 与 `latent_dirty`：
  - RGB 涂抹仅更新 `pixel_buffer`，并标记脏区。
  - Mixbox 涂抹前对脏像素按需从 RGB 同步 latent，修复跨模式不融合。
- 保持吸色结果与画布显示一致（WYSIWYG）。

### Phase 4：稳定性与状态持久化
- 面板状态持久化到 IndexedDB：
  - 存储 `pixel_buffer` 与关键设置（半径/透明度/硬度/模式）。
- 增加保存节流与收尾强制保存：
  - 高频涂抹时 debounce 存储。
  - 抬笔时立即保存，降低异常关闭丢失概率。
- 支持旧版 localStorage 状态迁移到 IndexedDB。

### Phase 5：打包与分发
目标：产出“已签名 ZXP”，并将其解压后的扩展目录部署到 CEP 扩展路径。

1. 前置准备
   - 确认 `CEP_package_tools/ZXPSignCmd.exe` 可用。
   - 若你安装了其它路径的 `ZXPSignCmd.exe`，先设置环境变量：
   - `$env:ZXPSIGNCMD_PATH = "C:\path\to\ZXPSignCmd.exe"`
   - 确认源目录存在：`cep_ext/com.jinshihui.paintablepalette/`
   - 确认 `lib/mixbox.js` 存在（打包脚本会复制到 `js/mixbox.js`）。

2. 生成或更新签名证书（.p12）
   - 首次打包必须先生成证书；已有证书可复用。
   - 命令：
```powershell
powershell -ExecutionPolicy Bypass -File .\CEP_package_tools\create_cep_self_signed_cert.ps1 -out_p12_path .\CEP_package_tools\certs\cep_self_signed.p12
```
   - 脚本会提示输入 `P12 password`。
   - 若目标证书已存在并需覆盖，追加 `-force`。

3. 使用脚本签名并打包 ZXP
   - 命令：
```powershell
powershell -ExecutionPolicy Bypass -File .\CEP_package_tools\package_cep_zxp.ps1 -cert_p12_path .\CEP_package_tools\certs\cep_self_signed.p12
```
   - 脚本会提示输入证书密码并创建时间戳产物。
   - 默认会排除 `.debug`；若需要包含调试配置，追加 `-include_debug`。
   - 产物位置：`dist/cep_zxp/com.jinshihui.paintablepalette-<timestamp>.zxp`

4. 验签（可选但建议）
```powershell
.\CEP_package_tools\ZXPSignCmd.exe -verify ".\dist\cep_zxp\com.jinshihui.paintablepalette-<timestamp>.zxp"
```

5. 解压 ZXP 到目录
   - ZXP 本质是 zip 格式，可用 7-Zip/WinRAR 或 PowerShell 解压。
   - 解压后目录必须包含：
     - `mimetype`
     - `META-INF/signatures.xml`
     - `CSXS/manifest.xml`
     - 其余扩展文件（`js/`, `jsx/`, `index.html`）
   - PowerShell 示例：
```powershell
$zxp = Get-ChildItem .\dist\cep_zxp\*.zxp | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Expand-Archive -LiteralPath $zxp.FullName -DestinationPath .\dist\cep_zxp\unzipped -Force
```

6. 复制解压后的扩展目录到 CEP 路径
   - 目标路径（Windows）：
   - `%APPDATA%\Adobe\CEP\extensions\com.jinshihui.paintablepalette\`
   - 复制时保持目录原样（不要丢失 `mimetype` 和 `META-INF`）。
   - PowerShell 示例：
```powershell
$src = ".\dist\cep_zxp\unzipped"
$dst = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.jinshihui.paintablepalette"
New-Item -ItemType Directory -Path $dst -Force | Out-Null
robocopy $src $dst /E /FFT /R:2 /W:1
```

7. 启动验证
   - 重启 Photoshop。
   - 打开 `窗口 > 扩展(旧版) > PaintablePalette (CEP)`。
   - 若未显示，先检查：
     - `CSXS/manifest.xml` 是否在目标目录内；
     - 目标目录是否包含 `mimetype` 与 `META-INF/signatures.xml`；
     - CEP 调试模式是否启用（未签名目录场景）。

---

## 4. 关键实现说明

### 4.1 数据流
- 涂抹流程：
  - 读取前景色 -> 轨迹采样 -> 按模式写像素 -> 调度渲染 -> 标记待保存
- 吸色流程：
  - 读取画布像素 -> 写回 Photoshop 前景色 -> 更新状态栏与色块

### 4.2 性能策略
- 渲染节流：
  - 使用 `requestAnimationFrame` + 最小时间间隔，减少重复 `putImageData`。
- 吸色节流：
  - 连续拖动吸色限制最小间隔，避免频繁 `evalScript`。
- 存储节流：
  - 延迟写入 IndexedDB，降低 I/O 抖动。

### 4.3 为什么使用 `latent_dirty`
RGB 与 Mixbox 共享画布时，如果只更新 RGB 缓冲而不更新 latent，会导致 Mixbox 读取旧基色，出现边缘不融合。  
通过 `latent_dirty` 延迟同步，可在保证正确性的同时避免每次 RGB 涂抹都做昂贵的 `rgbToLatent`。

---

## 5. 脚本与命令

### 5.1 同步开发扩展
```powershell
powershell -ExecutionPolicy Bypass -File .\sync_cep_extension.ps1
```

### 5.2 证书与 ZXP 打包
```powershell
powershell -ExecutionPolicy Bypass -File .\CEP_package_tools\create_cep_self_signed_cert.ps1 -out_p12_path .\CEP_package_tools\certs\cep_self_signed.p12
powershell -ExecutionPolicy Bypass -File .\CEP_package_tools\package_cep_zxp.ps1 -cert_p12_path .\CEP_package_tools\certs\cep_self_signed.p12
```

---

## 6. 注意事项
- CEP 是 Legacy 扩展体系，面板在某些宿主场景（例如 tab 切换）可能被销毁重建，属于宿主行为。
- Mixbox 许可为 CC BY-NC 4.0，商用需单独确认授权。
- 若更新根目录 `lib/mixbox.js`，需要同步到 `cep_ext/.../js/mixbox.js`（可直接运行同步脚本）。
