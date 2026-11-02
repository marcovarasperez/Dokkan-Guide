fn main() {
    // For Android builds, tell tauri-build to skip frontend build
    // (tauri-build should auto-detect via TAURI_ANDROID_PROJECT_PATH, but ensure it)
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let is_android = target_os == "android" || std::env::var("TAURI_ANDROID_PROJECT_PATH").is_ok();

    if is_android {
        std::env::set_var("TAURI_SKIP_FRONTEND_BUILD", "1");
        println!("cargo::rustc-cfg=mobile");
    }

    tauri_build::build()
}