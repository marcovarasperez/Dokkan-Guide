// Guía fan de Dokkan Battle Global — proyecto no comercial.
// Compilación sin ventana de consola en release (solo Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Transporte HTTP sin restricciones CORS hacia dokkan.fyi/cdn (usado por src/data/http.ts).
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
