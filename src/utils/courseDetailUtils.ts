import type {
  CellData,
  CourseData,
  CourseDetailData,
  CourseListEntry,
  CourseMetadata,
  Timetable as TimetableMatrix,
} from "@/types";

const days = ["月", "火", "水", "木", "金"];

export type SelectedCell = CellData & { day: number; period: number[] };

/**
 * セルが有効な選択状態（曜日と時限を持つ）かどうかを判定する Type Guard
 */
export const hasValidCellSelection = (cell: CellData): cell is SelectedCell => {
  return (
    cell.day !== null && Array.isArray(cell.period) && cell.period.length > 0
  );
};

/**
 * 選択されたセルから、そこに登録されている授業のコードを取得する
 */
export const getCourseCodeFromCell = (
  cell: CellData,
  timetable: TimetableMatrix,
): string | null => {
  if (!hasValidCellSelection(cell)) {
    return null;
  }
  const [primaryPeriod] = cell.period;
  if (!primaryPeriod || primaryPeriod < 1 || primaryPeriod > timetable.length) {
    return null;
  }
  // timetable は 0-indexed, period は 1-indexed
  const row = timetable[primaryPeriod - 1];
  const cellCourse = row?.[cell.day];
  if (!cellCourse || typeof cellCourse === "string") {
    return null;
  }
  return cellCourse.code;
};

/**
 * 授業コードとストアのデータから、詳細パネル表示用のデータを構築する
 */
export const buildCourseDetail = (
  courseCode: string | null,
  entriesByCode: Record<string, CourseListEntry>,
  transcriptStatuses: Record<string, "履修" | "修得" | null | undefined>,
): CourseDetailData | null => {
  if (!courseCode) {
    return null;
  }
  const entry = entriesByCode[courseCode];
  const baseRow = entry?.rows[0];
  if (!entry || !baseRow) {
    return null;
  }

  return {
    sectionCode: baseRow.code,
    abbr: baseRow.abbr,
    section: baseRow.section,
    courseName: baseRow.course,
    subject: baseRow.subject,
    credits: baseRow.credits,
    status: transcriptStatuses[baseRow.course] ?? null,
    prerequisite: null,
  };
};

/**
 * 授業リストや行データから、表示用の付加情報（曜日・時限・単位数による補足）を生成する
 */
export const getCourseInfo = (data: CourseData[]): string => {
  if (!data || data.length === 0) return "";
  const [{ credits, period }] = data;
  const singlePeriodLabel = period?.[0] ? `${period[0]}限` : "";
  const dayLabel = () => data.map((d) => days[d.day]).join(", ");

  if (credits <= 1) {
    return data.length > 1
      ? `(${dayLabel()} ${singlePeriodLabel})`
      : `(${singlePeriodLabel})`;
  }

  if (credits >= 4) {
    return `(${dayLabel()})`;
  }

  return "";
};

/**
 * CourseMetadata を 教科(subject) ごとにグループ化する
 */
export const groupCoursesBySubject = (
  courses: CourseMetadata[],
): Record<string, CourseMetadata[]> => {
  return courses.reduce(
    (acc, course) => {
      const { subject } = course;
      if (!acc[subject]) {
        acc[subject] = [];
      }
      acc[subject].push(course);
      return acc;
    },
    {} as Record<string, CourseMetadata[]>,
  );
};
