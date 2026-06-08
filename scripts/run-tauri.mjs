/**
 * Runs the Tauri CLI with ~/.cargo/bin on PATH so `cargo` is found even when
 * rustup was installed but the terminal was never restarted.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cargoBin = join(homedir(), ".cargo", "bin");
const cargoExe = join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");

if (!existsSync(cargoExe)) {
  console.error(
    "Rust/Cargo not found. Install from https://rustup.rs then restart your terminal.",
  );
  console.error(`Expected: ${cargoExe}`);
  process.exit(1);
}

const pathKey = process.platform === "win32" ? "Path" : "PATH";
const nodeBin = join(process.cwd(), "node_modules", ".bin");
const pathSep = process.platform === "win32" ? ";" : ":";
const env = {
  ...process.env,
  [pathKey]: [cargoBin, nodeBin, process.env[pathKey] ?? ""].filter(Boolean).join(pathSep),
};

const args = process.argv.slice(2);
const tauriBin =
  process.platform === "win32"
    ? join(nodeBin, "tauri.cmd")
    : join(nodeBin, "tauri");

const result = spawnSync(tauriBin, args, {
  stdio: "inherit",
  env,
  shell: false,
});

process.exit(result.status ?? 1);
