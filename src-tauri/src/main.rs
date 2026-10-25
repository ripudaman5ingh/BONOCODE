#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = bonocode_lib::ssh_askpass::maybe_run() {
        std::process::exit(code);
    }
    #[cfg(all(debug_assertions, target_os = "macos"))]
    bonocode_lib::ensure_macos_dev_bundle();
    bonocode_lib::run()
}
