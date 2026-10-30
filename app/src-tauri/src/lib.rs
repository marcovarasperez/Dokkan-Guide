// Guía fan de Dokkan Battle Global — proyecto no comercial.
// Biblioteca para Android (cdylib) y otros targets.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Transporte HTTP sin restricciones CORS hacia dokkaninfo.com (fuente
        // única de datos e imágenes, usado por src/model/http.ts).
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}