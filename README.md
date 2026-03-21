# Paintable Palette 调色盘插件 (PS)

English: [README_EN.md](README_EN.md)

在 Photoshop 内提供一个“可涂抹的调色盘面板”：用当前前景色在调色盘上混色，并可吸色回写到 Photoshop 前景色。

![alt text](00assets/image-3.png)


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

- **Photoshop 版本**：本插件属于 Photoshop 的「扩展（旧版）」类型。我们已在 **Photoshop 2019** 与 **Photoshop 2024** 上做过实际使用验证；从 Adobe 的兼容范围来看，**Photoshop CC 2017 及更新版本**一般都可以使用（具体以你电脑上的 Photoshop 是否仍提供「窗口 → 扩展（旧版）」菜单为准）。
- **输入设备**：可用**普通鼠标**正常涂抹与吸色；使用**数位板笔、Surface 触控笔**等笔类设备时，同样支持在调色盘上绘画；需要临时吸色时，可按住键盘 **Alt**（或配合插件里的 **Pick** 模式），与鼠标用法一致。
- **苹果电脑（M 系列芯片）**：在较新的 Photoshop（例如 **2025 / 26 版**）里，若发现**找不到「扩展（旧版）」菜单**或相关入口不可用，多半是系统在「原生运行」Photoshop。此时可在 **访达** 里对 **Photoshop** 图标**右键 → 显示简介**，勾选 **「使用 Rosetta 打开」**，再重新启动 Photoshop，通常即可正常使用本插件。


## 仓库内容（源码）

本仓库源码为 **RGB-only** 版本，对应目录：

- `cep_ext/rgb_only/com.jinshihui.paintablepalette/`

仓库中不包含 Mixbox 代码；Mixbox-NC 版本仅以 Release zip 方式提供。

## 安装与使用（CEP）

### 方式 A：从 Releases 安装（推荐）

1. 下载对应版本的 Release zip，用windows自带的解压缩：右键“全部解压缩”。
 ![](<./00assets/README_2026-03-21-11-02-12.png>)

2. 将解压出来的扩展目录（`com.jinshihui.paintablepalette_mixbox`或`com.jinshihui.paintablepalette_RGB`）复制到 CEP 扩展目录：
   - Windows：`C:\Users\你的用户名\AppData\Roaming\Adobe\CEP\extensions`
   - macOS：`~/Library/Application Support/Adobe/CEP/extensions/`

目录结构示例：
```text
C:\Users\你的用户名\AppData\Roaming\Adobe\CEP\extensions\
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
![](<./00assets/README_2026-03-21-11-11-05.png>)

> 请在解压、复制过程中保持解压得到的目录中文件原样不变，尤其是 `mimetype` 与 `META-INF/signatures.xml`签名文件。

3. 启动 Photoshop，从 `窗口 > 扩展(旧版)` 打开面板

![](<./00assets/README_2026-03-21-11-12-02.png>)

4. 由于PS 2019/2020 对自签名更严格，以及签名链路较脆弱的问题，当已把插件文件夹复制到CEP扩展目录，仍然在PS-窗口-扩展（旧版）找不到插件，需将PS设置为调试模式。

按 Win + R，打开“运行”，输入：`regedit`，打开注册表编辑器。在注册表编辑器中，找到以下路径：`HKEY_CURRENT_USER\Software\Adobe\CSXS.9`，在右侧窗口中找到或新建 `PlayerDebugMode` 项，双击打开，将值改为 `1`，点击确定保存。
![](<./00assets/README_2026-03-21-11-22-25.png>)


### 方式 B：从源码安装（仅 RGB-only，开发用）

将 `cep_ext/rgb_only/com.jinshihui.paintablepalette/` 复制到 CEP 扩展目录（见上文）。

说明：源码目录通常不包含签名信息，部分宿主环境可能需要开启 CEP 调试模式（`PlayerDebugMode=1`）才能加载未签名扩展。

## Mixbox-NC 的限制（务必阅读）

Mixbox-NC 版本包含 Mixbox（Secret Weapons），其许可为 **CC BY-NC 4.0（仅非商用）**：

- 任何包含 Mixbox 的版本均 **不得用于商业用途**
- 如需商用，请联系 Mixbox 作者获取商用授权（上游仓库：`https://github.com/scrtwpns/mixbox`）

更多第三方声明见：`THIRD_PARTY_NOTICES.md`
