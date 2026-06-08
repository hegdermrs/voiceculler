# Bundled ExifTool (optional — fast CR3 preview extraction)

The desktop app auto-runs ExifTool when you pick a photo folder. If ExifTool is
not bundled, it falls back to a system install (`brew install exiftool` on Mac).

## macOS (recommended for developers)

```bash
brew install exiftool
```

Homebrew installs to `/opt/homebrew/bin/exiftool` (Apple Silicon) or
`/usr/local/bin/exiftool` (Intel). The app checks both automatically.

### Bundling ExifTool for distribution (Mac)

Tauri sidecar naming — place **one** binary per build target in this folder:

| Mac type | Filename |
|----------|----------|
| Apple Silicon (M1/M2/M3) | `exiftool-aarch64-apple-darwin` |
| Intel Mac | `exiftool-x86_64-apple-darwin` |

Download the macOS package from https://exiftool.org — the `exiftool` Perl script
must be able to find its `exiftool_files` directory. For a single-file sidecar,
prefer the **Homebrew bottle** or build a standalone wrapper. Simplest path for
dev: use `brew install exiftool` and skip bundling.

Then enable in `tauri.conf.json`:
```json
"externalBin": ["binaries/exiftool"]
```

## Windows

Copy `exiftool.exe` from https://exiftool.org and rename to:
`exiftool-x86_64-pc-windows-msvc.exe`

## License

ExifTool is GPL/Artistic licensed separately. Do not commit binaries to a public
repo without checking license implications — they are gitignored here.
