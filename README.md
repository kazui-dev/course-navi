# 山吹履修ナビ (course-navi)

大学の履修計画・時間割管理のためのデスクトップアプリです。  
Tauri 2 + React で構築され、SQLite に科目マスタ・履修記録・保存スロットを保持します。

## 機能

### 履修登録ページ

- **年度・クラス選択** … 利用可能な年度・クラスで科目一覧・時間割を切り替え
- **科目検索** … 科目名・略称・エイリアスで検索し、候補から時間割に登録
- **時間割表示** … 月〜金・時限ごとのグリッド。セルクリックで科目詳細を表示
- **登録・取消** … 科目の履修登録・取消。履修記録（履修/修得）と連携
- **保存・読み込み** … 時間割をスロット単位で保存・読み込み（名前・メモ付き）
- **元に戻す・やり直し** … 時間割操作の Undo / Redo
- **キーボードショートカット**
  - `Ctrl+S` … 保存モーダルを開く
  - `Ctrl+O` … 読み込みモーダルを開く
  - `Ctrl+Z` … 元に戻す
  - `Ctrl+Y` / `Ctrl+Shift+Z` … やり直し

### 履修記録ページ

- **履修記録の一覧** … 年度・科目名・履修状況（履修/修得）・単位数を表示
- **追加・編集・削除** … 履修記録の登録・更新・削除（削除時はトーストで取り消し可能）
- **絞り込み** … 年度・履修状況・科目名／略称でフィルタ
- **修得単位数** … フィルタ結果に対する修得単位の合計を表示

### データ・バックアップ

- **SQLite** … 科目マスタ・開講情報・履修記録・保存スロットを `course-navi-db.db` に保存
- **ローカルバックアップ** … ユーザープロファイル・履修記録・保存スロットの最新を `localStorage` に退避し、DB 初期化時の復元に利用

## 技術スタック

| 分類     | 技術                         |
|----------|------------------------------|
| アプリ基盤 | [Tauri](https://tauri.app/) 2 |
| フロント | React 19, TypeScript, Vite 7 |
| UI       | Tailwind CSS, Radix UI, Lucide |
| 状態管理 | Zustand                      |
| ルーティング | React Router v7           |
| DB       | SQLite（`@tauri-apps/plugin-sql`） |
| フォーマット・Lint | Biome               |

## 必要環境

- [Node.js](https://nodejs.org/)（推奨: LTS）
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)（Tauri ビルド用）
- その他 [Tauri のセットアップ](https://tauri.app/v2/guides/getting-started/prerequisites)に従い、各 OS 用の依存を入れてください。

## セットアップ・実行

```bash
# 依存関係のインストール
pnpm install

# 開発モードで起動（Vite + Tauri）
pnpm dev
```

初回は Vite のビルド後に Tauri のウィンドウが開きます。

## ビルド

```bash
pnpm build
```

`src-tauri/target/release/` に実行ファイル、`src-tauri/target/release/bundle/` に NSIS / MSI インストーラが生成されます。  
日本語向けに NSIS の言語が `Japanese`、Wix の言語が `ja-JP` に設定されています。

## 主な npm スクリプト

| コマンド       | 説明                         |
|----------------|------------------------------|
| `pnpm dev`     | 開発サーバー + Tauri で起動  |
| `pnpm build`   | Tauri アプリをビルド         |
| `pnpm check`   | Biome でチェック・自動整形   |
| `pnpm vite`    | Vite のみ起動（プレビュー用）|

## プロジェクト構成

```
course-navi/
├── src/                    # フロントエンド (React)
│   ├── components/         # 共通・レイアウト・モーダル・時間割 UI
│   ├── lib/                # 確認ダイアログ・トースト・ユーティリティ
│   ├── pages/              # 履修登録・履修記録ページ
│   ├── services/           # DB クライアント・ローカルバックアップ
│   ├── stores/             # Zustand ストア
│   ├── types/              # 型定義
│   └── utils/              # 時間割・前提条件などのヘルパー
├── src-tauri/              # Tauri (Rust)
│   ├── src/
│   │   ├── lib.rs          # プラグイン登録・エントリ
│   │   └── migrations.rs   # DB マイグレーション
│   ├── course-navi-db.db   # SQLite DB（同梱）
│   └── tauri.conf.json     # アプリ名・ビルド設定など
└── package.json
```

## ライセンス

Private リポジトリのため、ライセンスは未定です。
