/**
 * Runs the Tauri CLI with ~/.cargo/bin on PATH so `cargo` is found even when
 * rustup was installed but the terminal was never restarted.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cargoBin = process.env.CARGO_HOME
  ? join(process.env.CARGO_HOME, "bin")
  : join(homedir(), ".cargo", "bin");
const cargoExe = join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");

const pathKey = process.platform === "win32" ? "Path" : "PATH";
const nodeBin = join(process.cwd(), "node_modules", ".bin");
const pathSep = process.platform === "win32" ? ";" : ":";
const pathParts = [nodeBin];
if (existsSync(cargoExe)) {
  pathParts.unshift(cargoBin);
}
pathParts.push(process.env[pathKey] ?? "");
const env = {
  ...process.env,
  [pathKey]: pathParts.filter(Boolean).join(pathSep),
};

const args = process.argv.slice(2);
const tauriCli = join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");

const result = spawnSync(process.execPath, [tauriCli, ...args], {
  stdio: "inherit",
  env,
  shell: false,
});

process.exit(result.status ?? 1);
