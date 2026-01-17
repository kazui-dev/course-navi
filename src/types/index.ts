/*
  概要:
  - src で共有される型を一元管理するファイル。
  - 基本的にはこのファイルのみ型を公開する。(shadcn/ui は別管理)
  - 記述は型定義に留め、副作用を含めない。
*/

// ======= DB周辺 =======
/**
 * DBから取得した生の行データ。
 * courseListの取得、HRのデータ取得、講座コードからのデータ取得に使用。
 */
export type RawCourseRow = {
  // 教科名（例: "情報")
  subject: string;
  // 科目名（例: "情報Ⅰ"）
  course: string;
  // 科目略称（例: "情Ⅰ"）講座コード表に準拠
  abbr: string;
  // 講座名 (例: "ア")
  section: string;
  // 設置単位数
  credits: number;
  // 曜日（月-金を0-4で表現）
  day: number;
  // 時限 (例: "1,2" や "1"）
  periods_str: string;
  // バツ科目フラグ（存在しない場合は null）
  x_mark: number | null;
  // 講座コード
  code: string;
  // 年度
  year: number;
  // 科目ソート用のキー MIN(sections.code) OVER (PARTITION BY courses.subject)
  subject_sort_key?: string | null;
  // 表示フラグ
  is_display?: number;
};

/**
 * `RawCourseRow` をフロント向けに整形した行データ。
 * `periods_str` を `period` 配列に変換。
 */
export type ProcessedRow = {
  // 教科名（例: "情報"）
  subject: string;
  // 科目名（例: "情報Ⅰ"）
  course: string;
  // 科目略称（例: "情Ⅰ"）講座コード表に準拠
  abbr: string;
  // 講座名 (例: "ア")
  section: string;
  // 設置単位数
  credits: number;
  // 曜日（月-金を0-4で表現）
  day: number;
  // 時限 (例: [1,2] や [1]）
  period: number[];
  // バツ科目フラグ（存在しない場合は null）
  x_mark: number | null;
  // 講座コード
  code: string;
  // 年度
  year: number;
};

/**
 * 複数の `ProcessedRow` をグルーピングした一覧（時間割表示向けの行データ）。
 */
export type CourseList = ProcessedRow & {
  // 科目ソート用のキー MIN(sections.code) OVER (PARTITION BY courses.subject)
  subjectSortKey: string;
  // 表示フラグ
  isDisplay: boolean;
};

// ======= 科目 =======
/**
 * CourseMetadata
 * - 科目に関するメタ情報（マスター情報）を表す型。
 * - 検索や履修判定、詳細表示で参照。
 */
export type CourseMetadata = {
  /** 科目コード/識別子 */
  course: string;
  /** 科目の所属教科（例: 数学） */
  subject: string;
  /** 表示用の略称 */
  abbr: string;
  /** その科目の単位数 */
  credits: number;
  /** 取得可能な最大単位数。null は制限無しを意味する */
  max_credits: number | null;
  /** X印フラグ（任意メタ情報） */
  x_mark: number | null;
  /** レコードの年度 */
  year: number;
  /** 科目ソートキー（任意） */
  subject_sort_key?: number | null;
  /** 科目ソートキー（任意） */
  course_sort_key?: number | null;
  /** 排他グループ（同一判定に利用） */
  exclusive_group?: string[] | null;
};

/**
 * CourseDetailData
 * - UI のコース詳細パネルで使う整形済みデータ。
 * - マスター情報に UI 向けフィールドを追加したもの。
 */
export type CourseDetailData = {
  /** セクションの識別子（任意） */
  sectionCode?: string;
  /** 略称 */
  abbr: string;
  /** 区分/セクション名 */
  section: string;
  /** 表示用の講義名 */
  courseName: string;
  /** 教科名 */
  subject: string;
  /** 単位数 */
  credits: number;
  /** ユーザー側の履修状態（未履修は null） */
  status: "履修" | "修得" | null;
  /** 前提条件のテキスト（任意） */
  prerequisite?: string | null;
};

/**
 * CourseListEntry
 * - `CourseList` をまとめたグループ単位の構造体。
 * - `rows` に同一講座の整形済み行 (`ProcessedRow`) を持つ。
 */
export type CourseListEntry = {
  /** グループ内の行一覧 */
  rows: ProcessedRow[];
  /** 表示可否 */
  isDisplay: boolean;
};

// ======= 時間割関連（表現／保存） =======
/**
 * CourseData
 * - UI 内で扱う「科目データ」のエイリアス。内部的には `ProcessedRow`。
 */
export type CourseData = ProcessedRow;

/** 単一科目を識別するコード（文字列） */
export type CourseCode = string;

/**
 * TimetableCellContent
 * - 時間割セルに入る内容。空文字列は空セルを表す。
 */
export type TimetableCellContent = CourseData | "";

/** 科目コードをキーにした科目配列のマップ */
export type CourseDataMap = Map<string, CourseData[]>;

/**
 * CellData
 * - 単一セルの位置情報を表現する補助型。
 */
export type CellData = {
  /** 曜日番号（未指定は null） */
  day: number | null;
  /** コマ配列（未指定は null） */
  period: number[] | null;
};

/** 保存用のタイムテーブル表現（コード配列） */
export type TimetableCodesTable = string[][];

/** 表示用のタイムテーブル（セルに CourseData または '' を持つ 2 次元配列） */
export type Timetable = TimetableCellContent[][];

// ======= 保存 / スロット =======
/**
 * SaveSlot
 * - ユーザーが保存した時間割スロットを表す DB レコード形式。
 */
export type SaveSlot = {
  /** スロットの一意 ID */
  id: number;
  /** 対象年度 */
  year: number;
  /** スロット名（表示用） */
  name: string;
  /** メモ（任意） */
  memo: string | null;
  /** 内部で保持するタイムテーブル JSON（文字列） */
  timetable_codes_json: string;
};

/** ParsedSaveSlot
 * - `SaveSlot` をパースしてタイムテーブル配列を復元した構造。
 */
export type ParsedSaveSlot = SaveSlot & {
  /** パース済みのタイムテーブル（保存形式から復元） */
  timetable: TimetableCodesTable;
};

// ======= 履修 / 履歴（トランスクリプト） =======
/**
 * TranscriptData
 * - 履修履歴（DB のトランスクリプト）を表す型。
 */
export type TranscriptData = {
  /** 履歴レコードの一意 ID */
  id: number;
  /** 科目名/コード */
  course_name: string;
  /** 年度 */
  year: number;
  /** 状態（履修 or 修得） */
  status: "履修" | "修得";
  /** 単位数 */
  credits: number;
};

/**
 * NewTranscriptData
 * - 新規に挿入するトランスクリプト用の入力型。
 */
export type NewTranscriptData = {
  /** 科目名/コード */
  course_name: string;
  /** 年度 */
  year: number;
  /** 状態 */
  status: "履修" | "修得";
  /** 単位数 */
  credits: number;
};

// ======= ユーザープロファイル / ルール =======
/**
 * UserProfile
 * - ユーザー/学校設定に関する簡易プロファイル。
 */
export type UserProfile = {
  /** 所属学科 */
  department: string;
  /** 学部/課程などの区分 */
  division: string;
  /** クラス/組 */
  class: string;
  /** 卒業年フラグ（0/1） */
  is_graduating_year: number;
};

/**
 * PrerequisiteRuleRecord
 * - 前提条件ルールを DB から取得したレコード形式で表す。
 */
export type PrerequisiteRuleRecord = {
  /** 対象科目名/コード */
  course_name: string;
  /** 適用年度 */
  year: number;
  /** 優先度（数値が低いほど高優先） */
  priority: number;
  /** 適用対象学科（省略可能） */
  target_department: string[] | null;
  /** 適用対象の卒業年フラグ（省略可能） */
  if_graduating: number | null;
  /** ルール本体（JSON 文字列で論理式を保持） */
  rule_logic_json: string;
};

/**
 * PrerequisiteViolation
 * - 前提条件検証で失敗した際の情報をまとめた型。
 */
export type PrerequisiteViolation = {
  /** ユーザー向けの失敗メッセージ群 */
  messages: string[];
  /** 検証対象となったルールレコード */
  rule: PrerequisiteRuleRecord;
  /** 説明テキスト（表示用） */
  description: string;
  /** 代替条件を示唆するフラグ（ある場合 true） */
  indicatesAlternative?: boolean;
};

// ======= 小物 / ユーティリティ =======
/**
 * SearchResult
 * - 授業検索・プレビューで返す候補の最小情報。
 */
export type SearchResult = {
  /** 曜日 */
  day: number;
  /** コマ配列 */
  period: number[];
  /** 科目名/ラベル */
  course_name: string;
};

/** ルールの判定ステータス（履修／修得） */
export type RuleStatus = "履修" | "修得";

/** 汎用 DB 操作結果 */
export type DbResult = {
  /** 成功フラグ */
  success: boolean;
  /** エラー種別またはメッセージ */
  error?: "DUPLICATE_NAME" | "DB_ERROR" | string | null;
};
