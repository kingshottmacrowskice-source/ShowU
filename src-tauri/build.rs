fn main() {
    let attributes = tauri_build::Attributes::new();
    // Tauri's default manifest only reaches the application binary, not lib tests.
    // Embed it for every target so native dialog imports resolve in test harnesses.
    // https://github.com/tauri-apps/tauri/issues/13419
    #[cfg(windows)]
    let attributes = {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
    };
    tauri_build::try_build(attributes).expect("Tauri build configuration failed");
}
