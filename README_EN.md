# Paintable Palette (Photoshop)

中文: [README.md](README.md)

A “paintable palette” panel inside Photoshop: mix colors on the palette with the current foreground color, and pick colors back to the Photoshop foreground color.

![alt text](00assets/image-3.png)


## Releases (two builds)

This project ships two installable zips on GitHub Releases:

- **RGB-only (commercial use allowed)**: RGB linear blending only; does not include Mixbox.
![alt text](00assets/image.png)
- **Mixbox-NC (non-commercial only)**: includes Mixbox natural-pigment mixing. Because Mixbox is licensed under **CC BY-NC 4.0**, this build is **for non-commercial use only**.
![alt text](00assets/image-1.png)
> Both builds share the same extension ID (`com.jinshihui.paintablepalette`); you cannot install them side by side—choose one.

## Features

- Palette canvas (fixed 300×300)
- Paint and mix using Photoshop’s current foreground color as the brush color
- RGB-only: standard alpha blending
- Mixbox-NC: paint-like mixing (latent-space blend)
- Color pick: `Alt`-drag or **Pick** mode to sample from the palette and write back to the Photoshop foreground color
- Clear: **Clear**
- State persistence: canvas content and mode are restored after switching tabs or reloading

## Compatibility

- **Photoshop**: This is a legacy **Extensions (Legacy)** panel. We have verified it on **Photoshop 2019** and **Photoshop 2024**; per Adobe’s compatibility guidance, **Photoshop CC 2017 and newer** generally work (confirm on your machine that **Window → Extensions (Legacy)** is still available).
- **Input**: Works with a **regular mouse** for painting and picking; **tablet pens, Surface Pen**, and similar stylus input are also supported on the palette. To pick temporarily, hold **Alt** on the keyboard (or use the panel’s **Pick** mode), same as with a mouse.
- **Apple Silicon (M-series)**: In newer Photoshop (e.g. **2025 / 26**), if **Extensions (Legacy)** is missing or unavailable, Photoshop is often running natively. In **Finder**, **right-click the Photoshop app → Get Info**, enable **Open using Rosetta**, then restart Photoshop—the panel should load normally.

## Repository contents (source)

The source in this repo is the **RGB-only** build, under:

- `cep_ext/rgb_only/com.jinshihui.paintablepalette/`

Mixbox code is not in the repository; the Mixbox-NC build is distributed only as a Release zip.

## Install & use (CEP)

### Option A: Install from Releases (recommended)

1. Download the zip for your build. On Windows, use built-in extraction: right-click the archive → **Extract All**.
 ![](<./00assets/README_2026-03-21-11-02-12.png>)

2. Copy the extracted extension folder (`com.jinshihui.paintablepalette_mixbox` or `com.jinshihui.paintablepalette_RGB`) into the CEP extensions folder:
   - Windows: `C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions`
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`

Example layout:
```text
C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\
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

> Keep extracted files unchanged—especially `mimetype` and `META-INF/signatures.xml`.

3. Launch Photoshop and open the panel from **Window → Extensions (Legacy)**.

![](<./00assets/README_2026-03-21-11-12-02.png>)

4. Photoshop 2019/2020 enforce self-signed extensions more strictly, and the signing chain can be fragile. If you copied the folder to the CEP extensions directory but the panel does not appear under **Window → Extensions (Legacy)**, enable CEP debug mode for Photoshop.

Press **Win + R**, type `regedit`, and open Registry Editor. Navigate to `HKEY_CURRENT_USER\Software\Adobe\CSXS.9`. In the right pane, find or create `PlayerDebugMode`, set its value to `1`, and confirm.
![](<./00assets/README_2026-03-21-11-22-25.png>)


### Option B: Install from source (RGB-only, development)

Copy `cep_ext/rgb_only/com.jinshihui.paintablepalette/` into the CEP extensions folder (paths above).

Note: Source trees often omit signature metadata; some hosts require CEP debug mode (`PlayerDebugMode=1`) to load unsigned extensions.

## Mixbox-NC restrictions (please read)

The Mixbox-NC build includes Mixbox (Secret Weapons), licensed under **CC BY-NC 4.0 (non-commercial only)**:

- Any build that includes Mixbox **must not be used commercially**
- For commercial use, contact the Mixbox authors for a license (upstream: `https://github.com/scrtwpns/mixbox`)

See also: `THIRD_PARTY_NOTICES.md`
