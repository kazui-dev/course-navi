mod migrations; // migrations.rs のインポート

// migrations モジュールの get_migrations() のインポート
use migrations::get_migrations; 

// Configuration Attribute の略。一応残す
// mobile フラグが立っている場合、 [tauri::mobile_entry_point] 属性を関数に追加
// -> モバイルビルド時もエントリポイントとしてコンパイルを通せる
#[cfg_attr(mobile, tauri::mobile_entry_point)]
// main.rs から呼び出される公開関数。ライブラリの起動とアプリの実行
pub fn run() {
    // Tauri ビルダーのインスタンスをデフォルト設定で初期化
    tauri::Builder::default()
        // SQL プラグインを登録
        .plugin(
            // tauri_plugin_sql のビルダーをデフォルト設定で起動
            tauri_plugin_sql::Builder::default()
                // マイグレーション情報の受け取り -> プラグインをビルド
                .add_migrations("sqlite:course-navi-db.db", get_migrations())
                .build(),
        )
        // 外部リンクをOS標準ブラウザで開くためのプラグインを登録 一応残す
        .plugin(tauri_plugin_opener::init())
        // 実行
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
