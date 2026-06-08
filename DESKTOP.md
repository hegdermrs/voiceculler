# Voice Photo Culler — Desktop

Installable **Mac** and **Windows** app. End users download one installer — no ExifTool,
no terminal, no Rust, no Node.

---

## For end users (install only)

### Mac
1. Download **`Voice Photo Culler.dmg`** (or `.app` from releases).
2. Open the DMG → drag **Voice Photo Culler** into **Applications**.
3. First launch: allow **Microphone** when asked (for voice Yes/No).
4. If macOS blocks an unsigned build: right-click the app → **Open** → **Open**.

### Windows
1. Download **`Voice Photo Culler_…_setup.exe`** or **`.msi`** from releases.
2. Double-click → follow the installer.
3. Allow microphone access if Windows prompts you.

That's it. ExifTool, the voice model, and the UI are **inside the installer**.

---

## For developers (build the installers)

You need Node + Rust **once** on each machine you build on. End users never do this.

### Mac builder
```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git checkout desktop/tauri
npm install
npm run tauri:build:mac        # Apple Silicon .app + .dmg
# or
npm run tauri:build:mac-universal
```

### Windows builder
```powershell
# Install Rust from https://rustup.rs and Node LTS
git checkout desktop/tauri
npm install
npm run tauri:build            # .msi + setup.exe
```

### What `tauri build` does automatically
1. **`npm run bundle-exiftool`** — downloads ExifTool from exiftool.org and packs it into the app (~15 MB).
2. **`npm run build`** — builds the React UI + offline voice model.
3. **Tauri bundle** — produces the installable:

| Platform | Output folder |
|----------|----------------|
| Mac | `src-tauri/target/release/bundle/macos/*.app` and `.../dmg/*.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/*.msi` and `.../nsis/*-setup.exe` |

Upload those files to GitHub Releases (or your site). Users click install — done.

---

## Ship to a Mac client (from your Windows PC)

You **cannot** build a `.dmg` on Windows. Use GitHub Actions (`.github/workflows/release.yml`).

### One-time setup
1. Push the `desktop/tauri` branch to GitHub.
2. On GitHub → **Actions** → **Release** → **Run workflow**.
3. Choose **apple-silicon** (M1/M2/M3 Mac) or **universal** (Intel + Apple Silicon).
4. When the workflow finishes, open the run → **Artifacts** → download **mac-installer**.

The artifact contains:
- **`Voice Photo Culler_….dmg`** — send this to the client.
- **`Voice Photo Culler.app.zip`** — optional zip of the app bundle.

### Tagged releases (Mac + Windows together)
```bash
git tag v0.1.0
git push origin v0.1.0
```
GitHub Actions builds both platforms and attaches installers to the **Release** page.

### What to tell the Mac client
1. Download the **`.dmg`** file.
2. Open it → drag **Voice Photo Culler** into **Applications**.
3. First launch: allow **Microphone** when prompted.
4. If macOS blocks the app: **Right-click** → **Open** → **Open** (normal for unsigned builds).

### Apple Silicon vs Intel
| Client's Mac | Build to use |
|--------------|--------------|
| M1 / M2 / M3 / M4 | **apple-silicon** (default) |
| Intel Mac | **universal** |
| Not sure | **universal** |

### Optional: signed & notarized builds
For distribution without the right-click workaround, you need an Apple Developer account ($99/year). Can be wired into CI later.

---

### Dev mode (you, not end users)
```bash
npm run bundle-exiftool   # first time only (cached after)
npm run tauri:dev
```

---

## What's bundled inside the app

| Component | End user installs separately? |
|-----------|----------------------------|
| App UI + voice model | No — included |
| ExifTool (CR3 previews) | No — downloaded at **build** time, shipped in app |
| Rust / Node / Homebrew | No — only builders need these |

---

## Branches

- **`main`** — browser app (Chrome)
- **`desktop/tauri`** — installable Mac + Windows (this branch)
