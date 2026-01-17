import { resolveResource } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import type {
  CourseList,
  CourseMetadata,
  DbResult,
  NewTranscriptData,
  PrerequisiteRuleRecord,
  ProcessedRow,
  RawCourseRow,
  SaveSlot,
  SearchResult,
  TranscriptData,
  UserProfile,
} from "@/types";

import { groupRowsByCourseCode } from "@/utils";

// 単一の DB インスタンスを保持して、再初期化を防ぐ。
let dbPromise: Promise<Database> | null = null;
function getDbInstance(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const resourcePath = await resolveResource("course-navi-db.db");
      return Database.load(`sqlite:${resourcePath}`);
    })();
  }
  return dbPromise;
}

// 利用可能な年度一覧を降順で取得する。履修記録の年度選択の初期値に使用。
async function fetchAvailableYearsForTranscripts(): Promise<number[]> {
  const db = await getDbInstance();
  const query = `SELECT DISTINCT year FROM sections ORDER BY year DESC`;
  const rows = await db.select<{ year: number }[]>(query);
  return rows.map((row) => row.year);
}

// fetchAvailableYearsForTranscriptsの参照元をsection_timesにしたもの。
//2023年度の時限情報が用意できなかったので、泣く泣く履修登録ではこちらを使う。
async function fetchAvailableYearsForTimetable(): Promise<number[]> {
  const db = await getDbInstance();
  const query = `SELECT DISTINCT year FROM section_times ORDER BY year DESC`;
  const rows = await db.select<{ year: number }[]>(query);
  return rows.map((row) => row.year);
}

// 利用可能なクラス一覧を取得する。セレクトの初期値に使用。
async function fetchAvailableClasses(year: number): Promise<string[]> {
  const db = await getDbInstance();

  // DB からホームルームを抽出し、講座名をクラス名として利用する。
  const query = `
    SELECT DISTINCT section 
    FROM sections 
    WHERE course = 'ホームルーム' AND year = ? 
    ORDER BY section
  `;
  const rows = await db.select<{ section: string }[]>(query, [year]);
  return rows.map((row) => row.section);
}

// 科目名または略称で検索し、該当する曜日・時限情報を返す。
async function searchCourseByName(
  courseName: string,
  year: number,
): Promise<SearchResult[]> {
  if (!courseName || courseName.trim() === "" || !year) return [];

  const db = await getDbInstance();
  const query = `
    SELECT 
      st.day, 
      GROUP_CONCAT(st.period) AS periods_str,
      s.course AS course_name
    FROM sections AS s
    JOIN courses ON courses.course = s.course AND courses.year = s.year
    JOIN section_times AS st ON s.code = st.code AND s.year = st.year
    WHERE ? IN (s.course, courses.abbr)
      AND s.year = ?
    GROUP BY st.day, s.course
    ORDER BY st.day
  `;
  const rows = await db.select<
    { day: number; periods_str: string; course_name: string }[]
  >(query, [courseName, year]);

  const result: SearchResult[] = rows.map((row) => ({
    day: row.day,
    period: row.periods_str
      .split(",")
      .map(Number)
      .sort((a, b) => a - b),
    course_name: row.course_name,
  }));
  return result;
}

// 指定年度に存在する科目の名称と略称のみ取得する。検索候補に使用。
async function fetchAllCourseNames(
  year: number,
): Promise<{ course: string; abbr: string; alias: string[] }[]> {
  const db = await getDbInstance();
  const query = `
    SELECT DISTINCT courses.course, courses.abbr, courses.alias
    FROM courses
    JOIN sections ON courses.course = sections.course AND courses.year = sections.year
    WHERE courses.year = ?
  `;
  const rows = await db.select<
    { course: string; abbr: string; alias: string }[]
  >(query, [year]);
  return rows.map((r) => {
    let aliasArr: string[] = [];
    if (r.alias) {
      try {
        const parsed = JSON.parse(r.alias);
        if (Array.isArray(parsed)) aliasArr = parsed.map(String);
        else if (typeof parsed === "string") aliasArr = [parsed];
        else aliasArr = [String(r.alias)];
      } catch (_e) {
        // 既に配列でないプレーン文字列の場合は単一要素配列にする
        aliasArr = [String(r.alias)];
      }
    }
    return { course: r.course, abbr: r.abbr, alias: aliasArr };
  });
}

// 指定年度に存在する科目の整形済みデータを取得する。開講時間を含む。
async function fetchCourseList(year: number): Promise<CourseList[]> {
  const db = await getDbInstance();

  // 教科を並び替えるために、各教科の科目のうち最小の講座コードをソートキーとして利用する。
  const query = `
    SELECT
      courses.subject,
      s.course,
      courses.abbr,
      s.section,
      courses.credits,
      st.day,
      GROUP_CONCAT(st.period) AS periods_str,
      courses.x_mark,
      s.code AS code,
      s.year,
      courses.is_display,
      MIN(s.code) OVER (PARTITION BY courses.subject) AS subject_sort_key
    FROM sections AS s
    JOIN courses ON courses.course = s.course AND courses.year = s.year
    JOIN section_times AS st ON s.code = st.code AND s.year = st.year
    WHERE s.year = ?
    GROUP BY s.code, st.day
    ORDER BY subject_sort_key, s.code, st.day
  `;

  const rows = await db.select<RawCourseRow[]>(query, [year]);

  return rows.map((row) => {
    const rawSortKey = row.subject_sort_key ?? row.code;
    return {
      subject: row.subject,
      course: row.course,
      abbr: row.abbr,
      section: row.section,
      credits: row.credits,
      day: row.day,
      period: row.periods_str
        .split(",")
        .map(Number)
        .sort((a, b) => a - b),
      x_mark: row.x_mark,
      code: String(row.code),
      year: row.year,
      subjectSortKey: rawSortKey ? String(rawSortKey) : String(row.code),
      isDisplay: (row.is_display ?? 1) === 1,
    };
  });
}

// 指定クラスのホームルームデータを取得し、整形して返す。
async function fetchHomeroomCourseData(
  sectionName: string,
  year: number,
): Promise<ProcessedRow[]> {
  if (!sectionName) return [];

  const db = await getDbInstance();
  const params = [year, sectionName];
  const query = `
    SELECT
      courses.subject, s.course, courses.abbr, s.section,
      courses.credits, st.day, GROUP_CONCAT(st.period) AS periods_str,
      courses.x_mark, s.code AS code, s.year
    FROM sections AS s
    JOIN courses ON courses.course = s.course AND s.year = s.year
    JOIN section_times AS st ON s.code = st.code AND s.year = st.year
    WHERE s.year = ? 
      AND s.course = 'ホームルーム' 
      AND s.section = ?
    GROUP BY s.code, st.day
    ORDER BY s.code, st.day
  `;

  const rows = await db.select<RawCourseRow[]>(query, params);
  const groupedRows = groupRowsByCourseCode(rows);
  return groupedRows[0] ?? [];
}

// 講座コードの配列をもとに、対応する科目データの二重配列を返す。
// 同一科目の複数行（曜日ごと）をまとめて返すユーティリティ。
async function fetchCourseDataByCodes(
  codes: string[],
  year: number,
): Promise<ProcessedRow[][]> {
  if (!codes || codes.length === 0) {
    return [];
  }
  const codePlaceholders = codes.map(() => "?").join(",");
  const params = [year, ...codes];

  const db = await getDbInstance();

  const query = `
    SELECT * FROM (
      SELECT
        courses.subject, s.course, courses.abbr, s.section,
        courses.credits, st.day, GROUP_CONCAT(st.period) AS periods_str,
        courses.x_mark, s.code AS code, s.year,
        MIN(s.code) OVER (PARTITION BY courses.subject) AS subject_sort_key
      FROM sections AS s
      JOIN courses ON courses.course = s.course AND courses.year = s.year
      JOIN section_times AS st ON s.code = st.code AND s.year = st.year
      WHERE s.year = ? 
        AND s.code IN (${codePlaceholders})
      GROUP BY s.code, st.day
    ) AS subquery

    ORDER BY subject_sort_key, code, day
  `;

  const rows = await db.select<RawCourseRow[]>(query, params);
  return groupRowsByCourseCode(rows);
}

// ユーザープロファイルを取得する。設定の初期値に使用。
// 現在はクラス, 卒業年度フラグを含む。
async function fetchUserProfile(year: number): Promise<UserProfile | null> {
  const db = await getDbInstance();
  const query = `
    SELECT department, division, class, is_graduating_year 
    FROM user_profile 
    WHERE year = ?
  `;
  const rows = await db.select<UserProfile[]>(query, [year]);
  return rows.length > 0 ? rows[0] : null;
}

// ユーザープロファイルを挿入または更新する。
async function upsertUserProfile(
  year: number,
  department: string,
  division: string,
  classNum: string,
): Promise<void> {
  if (!department || !division || !classNum) return;
  const db = await getDbInstance();

  const query = `
    INSERT INTO user_profile (year, department, division, class) 
    VALUES (?, ?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET
      department = excluded.department,
      division = excluded.division,
      class = excluded.class
  `;
  try {
    await db.execute(query, [year, department, division, classNum]);
  } catch (error: unknown) {
    console.error(error);
  }
}

// 時間割の保存スロットを取得する。
async function fetchSaveSlots(year: number): Promise<SaveSlot[]> {
  const db = await getDbInstance();
  const query = `
    SELECT id, year, name, memo, timetable_codes_json 
    FROM save_slots 
    WHERE year = ? 
    ORDER BY id ASC
  `;
  return db.select<SaveSlot[]>(query, [year]);
}

// 新しい保存スロットを挿入する。
// 名前重複時は `DUPLICATE_NAME` エラーを返す。
async function insertSaveSlot(
  year: number,
  name: string,
  memo: string | null,
  timetable_codes_json: string,
): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `
    INSERT INTO save_slots (year, name, memo, timetable_codes_json) 
    VALUES (?, ?, ?, ?)
  `;
  try {
    await db.execute(query, [year, name, memo, timetable_codes_json]);
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    if (error instanceof Error) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return { success: false, error: "DUPLICATE_NAME" };
      }
    }
    return { success: false, error: "DB_ERROR" };
  }
}

// 保存スロットの名前とメモを更新する。
// 名前重複時は `DUPLICATE_NAME` エラーを返す。
async function updateSaveSlotNameAndMemo(
  id: number,
  newName: string,
  newMemo: string | null,
): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `
    UPDATE save_slots SET name = ?, memo = ? 
    WHERE id = ?
  `;
  try {
    await db.execute(query, [newName, newMemo, id]);
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    if (error instanceof Error) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return { success: false, error: "DUPLICATE_NAME" };
      }
    }
    return { success: false, error: "DB_ERROR" };
  }
}

// 既存の保存スロットを上書きする。
async function overwriteSaveSlot(
  year: number,
  name: string,
  memo: string | null,
  timetable_codes_json: string,
): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `
    UPDATE save_slots SET memo = ?, timetable_codes_json = ? 
    WHERE year = ? AND name = ?
  `;
  try {
    await db.execute(query, [memo, timetable_codes_json, year, name]);
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: "DB_ERROR" };
  }
}

// 指定 ID の保存スロットを削除する。
async function deleteSaveSlot(id: number): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `DELETE FROM save_slots WHERE id = ?`;
  try {
    await db.execute(query, [id]);
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { success: false, error: "DB_ERROR" };
  }
}

// 科目のメタデータを取得する。開講時間を含まない。
// `exclusive_group` は DB では JSON テキストなので、配列に変換する。
// 主に履修違反の判定に使用。
async function fetchCourseMetadata(year: number): Promise<CourseMetadata[]> {
  const db = await getDbInstance();

  const query = `
    SELECT * FROM (
      SELECT 
        c.course, c.subject, c.abbr, c.credits, c.max_credits, c.exclusive_group, c.x_mark, c.year,
        MIN(s.code) OVER (PARTITION BY c.subject) as subject_sort_key,
        MIN(s.code) as course_sort_key
      FROM courses AS c
      LEFT JOIN sections AS s ON c.course = s.course AND c.year = s.year 
      WHERE c.year = ?
      GROUP BY c.course
    ) AS sub
    ORDER BY subject_sort_key, course_sort_key, course
  `;

  try {
    const rawResults = await db.select<any[]>(query, [year]);
    const results: CourseMetadata[] = rawResults.map((r) => {
      let exclusive_group: string[] | null = null;
      if (r.exclusive_group) {
        try {
          const parsed = JSON.parse(String(r.exclusive_group));
          if (Array.isArray(parsed)) exclusive_group = parsed.map(String);
        } catch (_err) {
          exclusive_group = null;
        }
      }
      return {
        course: r.course,
        subject: r.subject,
        abbr: r.abbr,
        credits: r.credits,
        max_credits: r.max_credits,
        x_mark: r.x_mark,
        year: r.year,
        subject_sort_key: r.subject_sort_key ?? null,
        course_sort_key: r.course_sort_key ?? null,
        exclusive_group,
      };
    });
    results.sort((courseA, courseB) => {
      const subjectKeyA = courseA.subject_sort_key ?? Infinity;
      const subjectKeyB = courseB.subject_sort_key ?? Infinity;
      if (subjectKeyA !== subjectKeyB) return subjectKeyA - subjectKeyB;

      const courseKeyA = courseA.course_sort_key ?? Infinity;
      const courseKeyB = courseB.course_sort_key ?? Infinity;
      if (courseKeyA !== courseKeyB) return courseKeyA - courseKeyB;

      return courseA.course.localeCompare(courseB.course);
    });
    return results;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 指定科目の前提条件を取得する。
// 戻り値は `priority` 順にソートされている。
async function fetchPrerequisiteRules(
  courseName: string,
  year: number,
): Promise<PrerequisiteRuleRecord[]> {
  if (!courseName) {
    return [];
  }
  const db = await getDbInstance();
  const query = `
    SELECT course_name, year, priority, target_department, if_graduating, rule_logic_json
    FROM prerequisite_rules
    WHERE course_name = ? AND year = ?
    ORDER BY priority ASC
  `;
  try {
    return await db.select<PrerequisiteRuleRecord[]>(query, [courseName, year]);
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 履修記録を一括挿入する。
async function insertTranscripts(
  records: NewTranscriptData[],
): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `
    INSERT INTO transcripts (course_name, year, status, credits)
    VALUES (?, ?, ?, ?)
  `;

  try {
    const insertPromises = records.map((record) => {
      return db.execute(query, [
        record.course_name,
        record.year,
        record.status,
        record.credits,
      ]);
    });

    await Promise.all(insertPromises);

    return { success: true };
  } catch (error: unknown) {
    console.error(error);

    if (error instanceof Error) {
      if (error.message.includes("FOREIGN KEY constraint failed")) {
        return { success: false, error: "FOREIGN_KEY" };
      }
    }
    return { success: false, error: "DB_ERROR" };
  }
}

// すべての履修記録を取得する。
async function fetchTranscripts(): Promise<TranscriptData[]> {
  try {
    const db = await getDbInstance();
    const results = await db.select<TranscriptData[]>(
      "SELECT * FROM transcripts ORDER BY year DESC, course_name",
    );
    return results;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 単一の履修記録を更新する。
async function updateTranscript(record: TranscriptData): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `
    UPDATE transcripts
    SET course_name = ?, year = ?, status = ?, credits = ?
    WHERE id = ?
  `;

  try {
    await db.execute(query, [
      record.course_name,
      record.year,
      record.status,
      record.credits,
      record.id,
    ]);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "DB_ERROR" };
  }
}

// 指定 ID の履修記録を削除する。
async function deleteTranscript(id: number): Promise<DbResult> {
  const db = await getDbInstance();
  const query = `DELETE FROM transcripts WHERE id = ?`;

  try {
    await db.execute(query, [id]);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "DB_ERROR" };
  }
}

export const dbClient = {
  fetchAvailableYearsForTranscripts,
  fetchAvailableYearsForTimetable,
  fetchAllCourseNames,
  fetchCourseList,
  searchCourseByName,
  fetchAvailableClasses,
  fetchUserProfile,
  upsertUserProfile,
  fetchHomeroomCourseData,
  fetchCourseDataByCodes,
  fetchSaveSlots,
  insertSaveSlot,
  updateSaveSlotNameAndMemo,
  overwriteSaveSlot,
  deleteSaveSlot,
  fetchTranscripts,
  fetchPrerequisiteRules,
  fetchCourseMetadata,
  insertTranscripts,
  updateTranscript,
  deleteTranscript,
};
