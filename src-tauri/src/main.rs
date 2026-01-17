// デバッグ時以外はコンソールを開けないように
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    course_navi_lib::run()
}
