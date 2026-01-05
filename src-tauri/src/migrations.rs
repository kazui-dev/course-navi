use tauri_plugin_sql::{Migration, MigrationKind};

// lib.rs から呼び出される関数
// ダミーマイグレーション
pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "Initial migration",
        sql: "", // 読み取り専用なので特になし
        kind: MigrationKind::Up,
        }]
}
