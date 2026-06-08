use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tauri_plugin_shell::ShellExt;

#[derive(serde::Serialize)]
struct ExifExtractResult {
  ok: bool,
  message: String,
  tool: String,
}


fn exiftool_args(raw_paths: &[String]) -> Vec<String> {
  let mut args = vec![
    "-b".into(),
    "-PreviewImage".into(),
    // %d = source file directory, %f = basename without extension → sidecar next to RAW.
    "-w".into(),
    "%d%f.jpg".into(),
  ];
  args.extend(raw_paths.iter().cloned());
  args
}

fn is_only_already_exists(stderr: &str) -> bool {
  let lines: Vec<_> = stderr
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .collect();
  !lines.is_empty() && lines.iter().all(|line| line.contains("already exists"))
}

fn exiftool_succeeded(exit_ok: bool, stderr: &str) -> bool {
  exit_ok || is_only_already_exists(stderr)
}

fn bundled_exiftool_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
  let resource_dir = app.path().resource_dir().ok()?;
  let bundled = resource_dir.join("exiftool");
  if bundled.join("exiftool_files").is_dir() {
    return Some(bundled);
  }
  if resource_dir.join("exiftool_files").is_dir() {
    return Some(resource_dir);
  }
  None
}

fn exiftool_home(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Some(dir) = bundled_exiftool_dir(app) {
    return Some(dir);
  }
  #[cfg(debug_assertions)]
  {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    if dev.join("exiftool_files").is_dir() {
      return Some(dev);
    }
  }
  None
}

fn run_bundled_exiftool(dir: &Path, args: &[String]) -> Result<Output, String> {
  let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

  #[cfg(target_os = "windows")]
  {
    let exe = dir.join("exiftool.exe");
    if !exe.is_file() {
      return Err("Bundled exiftool.exe missing".into());
    }
    return Command::new(&exe)
      .current_dir(dir)
      .args(&arg_refs)
      .output()
      .map_err(|e| format!("Bundled ExifTool failed: {e}"));
  }

  #[cfg(target_os = "macos")]
  {
    let script = dir.join("exiftool");
    if !script.is_file() {
      return Err("Bundled exiftool script missing".into());
    }
    // macOS ships /usr/bin/perl; EXIFTOOL_HOME locates exiftool_files in the bundle.
    return Command::new("/usr/bin/perl")
      .arg(&script)
      .current_dir(dir)
      .env("EXIFTOOL_HOME", dir)
      .args(&arg_refs)
      .output()
      .map_err(|e| format!("Bundled ExifTool failed: {e}"));
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    let _ = (dir, arg_refs);
    Err("Bundled ExifTool not supported on this platform".into())
  }
}

fn find_system_exiftool() -> Option<PathBuf> {
  let mut paths = Vec::new();
  #[cfg(target_os = "macos")]
  {
    paths.extend([
      PathBuf::from("/opt/homebrew/bin/exiftool"),
      PathBuf::from("/usr/local/bin/exiftool"),
    ]);
  }
  #[cfg(target_os = "windows")]
  {
    paths.push(PathBuf::from("exiftool.exe"));
  }
  paths.push(PathBuf::from("exiftool"));

  for candidate in paths {
    if candidate.is_file() {
      return Some(candidate);
    }
    if let Ok(p) = which::which(&candidate) {
      return Some(p);
    }
  }
  None
}

async fn run_exiftool(app: &tauri::AppHandle, raw_paths: &[String]) -> Result<(bool, String), String> {
  if raw_paths.is_empty() {
    return Ok((true, "Skipped — previews already present".into()));
  }

  let args = exiftool_args(raw_paths);
  let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

  // 1) Bundled inside the installer (production path — no user setup).
  if let Some(dir) = bundled_exiftool_dir(app) {
    match run_bundled_exiftool(&dir, &args) {
      Ok(output) if exiftool_succeeded(output.status.success(), &String::from_utf8_lossy(&output.stderr)) => {
        return Ok((true, "Bundled ExifTool (included with app)".into()));
      }
      Ok(output) => {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Bundled ExifTool failed: {stderr}"));
      }
      Err(e) => return Err(e),
    }
  }

  // 2) Tauri sidecar (dev + Windows/macOS bundled binary).
  if let Ok(mut sidecar) = app.shell().sidecar("exiftool") {
    if let Some(home) = exiftool_home(app) {
      sidecar = sidecar.env("EXIFTOOL_HOME", &home);
    }
    let output = sidecar
      .args(arg_refs.clone())
      .output()
      .await
      .map_err(|e| format!("Sidecar ExifTool failed: {e}"))?;
    if exiftool_succeeded(output.status.success(), &String::from_utf8_lossy(&output.stderr)) {
      return Ok((true, "Sidecar ExifTool".into()));
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.trim().is_empty() {
      return Err(format!("Sidecar ExifTool failed: {stderr}"));
    }
  }

  // 3) System PATH (dev machines with brew install exiftool).
  if let Some(path) = find_system_exiftool() {
    let output = Command::new(&path)
      .args(arg_refs)
      .output()
      .map_err(|e| format!("System ExifTool failed: {e}"))?;
    if exiftool_succeeded(output.status.success(), &String::from_utf8_lossy(&output.stderr)) {
      return Ok((true, path.display().to_string()));
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("ExifTool failed: {stderr}"));
  }

  Err(
    "ExifTool not available. Reinstall the app or rebuild with: npm run bundle-exiftool".into(),
  )
}

#[tauri::command]
fn allow_folder_access(window: tauri::Window, path: String) -> Result<(), String> {
  let path_buf = PathBuf::from(&path);
  if !path_buf.is_dir() {
    return Err(format!("Not a directory: {path}"));
  }

  if let Some(fs_scope) = window.try_fs_scope() {
    fs_scope
      .allow_directory(&path_buf, true)
      .map_err(|e| e.to_string())?;
  }

  window
    .state::<tauri::scope::Scopes>()
    .allow_directory(&path_buf, true)
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
async fn extract_previews_exiftool(
  app: tauri::AppHandle,
  raw_paths: Vec<String>,
) -> Result<ExifExtractResult, String> {
  let (ok, tool) = run_exiftool(&app, &raw_paths).await?;
  Ok(ExifExtractResult {
    ok,
    message: if raw_paths.is_empty() {
      "Preview JPEGs already present".into()
    } else {
      format!("Preview JPEGs written for {} RAW file(s)", raw_paths.len())
    },
    tool,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![allow_folder_access, extract_previews_exiftool])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
