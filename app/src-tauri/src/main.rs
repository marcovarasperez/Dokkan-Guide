// Guía fan de Dokkan Battle Global — proyecto no comercial.
// Compilación sin ventana de consola en release (solo Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dokkan_fan_guide::run();
}