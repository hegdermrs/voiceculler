/**
 * Downloads and extracts ExifTool into src-tauri/resources/exiftool so the
 * built .app / .msi is self-contained — end users never install ExifTool.
 *
 * Run automatically before `tauri build` (see tauri.conf.json).
 */
import { execSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const VERSION = "13.59";
const OUT_DIR = join("src-tauri", "resources", "exiftool");
const BINARIES_DIR = join("src-tauri", "binaries");

async function bundleFromBinaries() {
  const filesDir = join(BINARIES_DIR, "exiftool_files");
  try {
    await access(filesDir);
  } catch {
    return false;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await cp(filesDir, join(OUT_DIR, "exiftool_files"), { recursive: true });

  if (process.platform === "win32") {
    const sidecar = join(BINARIES_DIR, "exiftool-x86_64-pc-windows-msvc.exe");
    try {
      await cp(sidecar, join(OUT_DIR, "exiftool.exe"));
    } catch {
      for (const name of ["exiftool.exe", "exiftool(-k).exe"]) {
        try {
          await cp(join(BINARIES_DIR, name), join(OUT_DIR, "exiftool.exe"));
          break;
        } catch {
          // try next name
        }
      }
    }
  } else if (process.platform === "darwin") {
    for (const name of [
      "exiftool-aarch64-apple-darwin",
      "exiftool-x86_64-apple-darwin",
      "exiftool",
    ]) {
      try {
        await cp(join(BINARIES_DIR, name), join(OUT_DIR, "exiftool"));
        execSync(`chmod +x "${join(OUT_DIR, "exiftool")}"`, { stdio: "inherit" });
        break;
      } catch {
        // try next name
      }
    }
  }

  console.log(`Copied ExifTool from ${BINARIES_DIR} → ${OUT_DIR}`);
  return true;
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "voice-photo-culler-build/1.0" },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const body = res.body;
  if (!body) throw new Error(`Empty response: ${url}`);
  await pipeline(Readable.fromWeb(body), createWriteStream(dest));
}

async function downloadFirst(urls, dest) {
  let lastErr;
  for (const url of urls) {
    try {
      await download(url, dest);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(String(err));
    }
  }
  throw lastErr ?? new Error(`All downloads failed: ${urls.join(", ")}`);
}

async function findChildDir(parent, prefix) {
  for (const name of await readdir(parent)) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      return join(parent, name);
    }
  }
  return null;
}

async function bundleWindows() {
  const tmp = await mkdtemp(join(tmpdir(), "exiftool-win-"));
  const zipPath = join(tmp, "exiftool.zip");
  await downloadFirst(
    [
      `https://exiftool.org/exiftool-${VERSION}_64.zip`,
      `https://sourceforge.net/projects/exiftool/files/exiftool-${VERSION}_64.zip/download`,
    ],
    zipPath,
  );

  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" },
  );

  const inner =
    (await findChildDir(tmp, `exiftool-${VERSION}`)) ??
    (await findChildDir(tmp, "exiftool")) ??
    tmp;

  const extracted = join(inner, "exiftool_files");
  const exeK = join(inner, "exiftool(-k).exe");
  const exePlain = join(inner, "exiftool.exe");

  // Zip layout: exiftool(-k).exe + exiftool_files/ (may be in a versioned subfolder).
  await cp(extracted, join(OUT_DIR, "exiftool_files"), { recursive: true });
  const outExe = join(OUT_DIR, "exiftool.exe");
  try {
    await cp(exeK, outExe);
  } catch {
    await cp(exePlain, outExe);
  }

  await rm(tmp, { recursive: true, force: true });
}

async function bundleMac() {
  const tmp = await mkdtemp(join(tmpdir(), "exiftool-mac-"));
  const tarPath = join(tmp, "exiftool.tar.gz");
  await downloadFirst(
    [
      `https://exiftool.org/Image-ExifTool-${VERSION}.tar.gz`,
      `https://sourceforge.net/projects/exiftool/files/Image-ExifTool-${VERSION}.tar.gz/download`,
    ],
    tarPath,
  );

  execSync(`tar -xzf "${tarPath}" -C "${tmp}"`, { stdio: "inherit" });

  const inner =
    (await findChildDir(tmp, "Image-ExifTool")) ??
    (await findChildDir(tmp, "exiftool")) ??
    tmp;

  await cp(join(inner, "exiftool_files"), join(OUT_DIR, "exiftool_files"), {
    recursive: true,
  });
  await cp(join(inner, "exiftool"), join(OUT_DIR, "exiftool"));
  // Perl script must be executable inside the .app bundle.
  execSync(`chmod +x "${join(OUT_DIR, "exiftool")}"`, { stdio: "inherit" });

  await rm(tmp, { recursive: true, force: true });
}

async function main() {
  if (process.env.SKIP_EXIFTOOL_BUNDLE === "1") {
    console.log("SKIP_EXIFTOOL_BUNDLE=1 — skipping ExifTool download.");
    return;
  }

  try {
    await access(join(OUT_DIR, "exiftool_files"));
    console.log(`ExifTool already bundled at ${OUT_DIR} — skipping download.`);
    return;
  } catch {
    // Not bundled yet.
  }

  if (await bundleFromBinaries()) {
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  if (process.platform === "win32") {
    await bundleWindows();
  } else if (process.platform === "darwin") {
    await bundleMac();
  } else {
    console.warn(`No ExifTool bundle recipe for ${process.platform}; using system ExifTool at runtime.`);
    return;
  }

  console.log(`Bundled ExifTool ${VERSION} → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
