import type { TimetableCellContent, Timetable, TimetableCodesTable, CourseDataMap, CourseCode, CourseList, CourseListEntry, CourseData } from '@/types';

export const createEmptyTimetable = (): Timetable => {
  return Array.from({ length: 12 }, () => Array<TimetableCellContent>(5).fill(''));
};

/**
 * timetable (CourseData[][]) を code[][] に変換する
 */
export const convertTimetableToCodes = (timetable: Timetable): TimetableCodesTable => {
  return timetable.map(row =>
    row.map(cell =>
      (typeof cell === 'object' ? cell.code : '')
    )
  );
};

/**
 * 指定した授業を時間割から削除（''で置換）した新しい配列を返す
 */
export const deleteCourse = (table: Timetable, courseData: TimetableCellContent): Timetable => {
  if (typeof courseData === 'string' || !courseData.code) {
    return structuredClone(table);
  }

  const courseCode = courseData.code;
  const newTable: Timetable = table.map(row =>
    row.map(cell =>
      (typeof cell === 'object' && cell.code === courseCode ? '' : cell)
    )
  );
  return newTable;
};

/**
 * IDの二次元配列と courseData の Map から timetable を復元する
 */
export const restoreTimetableFromCodes = (
  codesTable: TimetableCodesTable,
  courseDataMap: CourseDataMap
): Timetable => {
  const newTimetable: Timetable = createEmptyTimetable();

  codesTable.forEach((row, rowIndex) => {
    row.forEach((code, colIndex) => {
      if (code) {
        const courseDataList = courseDataMap.get(code);
        if (courseDataList) {
          const matchingCourseData = courseDataList.find(course =>
            course.day === colIndex && course.period.includes(rowIndex + 1)
          );
          if (matchingCourseData) {
            newTimetable[rowIndex][colIndex] = matchingCourseData;
          }
        }
      }
    });
  });

  return newTimetable;
};

/**
 * 時間割に含まれる授業の合計単位数を計算する
 */
export const calculateCredits = (timetable: Timetable): number => {
  let credits = 0;
  const countedCodes = new Set<CourseCode>();

  timetable.forEach(row => {
    row.forEach(cell => {
      if (cell !== '' && !countedCodes.has(cell.code)) {
        // このブロック内では cell は CourseData と型推論される
        countedCodes.add(cell.code);
        credits += cell.credits;
      }
    });
  });
  return credits;
};

export const getCellKey = (day: number, period: number): string => {
  const startPeriod = Math.floor((period - 1) / 2) * 2 + 1;
  return `${day}-${startPeriod}`;
};

interface SubjectSortKeyValue {
  raw: string;
  numeric: number | null;
}

const createSubjectSortKeyValue = (value: string): SubjectSortKeyValue => {
  const numeric = Number(value);
  return {
    raw: value,
    numeric: Number.isFinite(numeric) ? numeric : null,
  };
};

const compareSubjectSortKeyValue = (a: SubjectSortKeyValue, b: SubjectSortKeyValue): number => {
  if (a.numeric !== null && b.numeric !== null) {
    return a.numeric - b.numeric;
  }
  if (a.numeric !== null) return -1;
  if (b.numeric !== null) return 1;
  return a.raw.localeCompare(b.raw);
};

const compareCourseCodes = (a: string, b: string): number => {
  const aNum = Number(a);
  const bNum = Number(b);
  const aIsNum = Number.isFinite(aNum);
  const bIsNum = Number.isFinite(bNum);
  if (aIsNum && bIsNum) return aNum - bNum;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return a.localeCompare(b);
};

const mapListRowToCourseData = (row: CourseList): CourseData => ({
  subject: row.subject,
  course: row.course,
  abbr: row.abbr,
  section: row.section,
  credits: row.credits,
  day: row.day,
  period: row.period,
  x_mark: row.x_mark,
  code: row.code,
  year: row.year,
});

interface ListCollections {
  courseEntriesByCode: Record<string, CourseListEntry>;
  subjectCourseMap: Map<string, Set<string>>;
  subjectOrderMap: Map<string, SubjectSortKeyValue>;
  coursesByCellMap: Map<string, Set<string>>;
}

const collectListCollections = (rows: CourseList[]): ListCollections => {
  const courseEntriesByCode: Record<string, CourseListEntry> = {};
  const subjectCourseMap = new Map<string, Set<string>>();
  const subjectOrderMap = new Map<string, SubjectSortKeyValue>();
  const coursesByCellMap = new Map<string, Set<string>>();

  rows.forEach(row => {
    const courseCode = row.code;
    const courseData = mapListRowToCourseData(row);
    if (!courseEntriesByCode[courseCode]) {
      courseEntriesByCode[courseCode] = { rows: [], isDisplay: row.isDisplay };
    }
    courseEntriesByCode[courseCode].rows.push(courseData);

    if (!row.isDisplay) {
      return;
    }

    if (!subjectCourseMap.has(row.subject)) {
      subjectCourseMap.set(row.subject, new Set());
    }
    subjectCourseMap.get(row.subject)!.add(courseCode);

    const sortKeyValue = createSubjectSortKeyValue(row.subjectSortKey ?? courseCode);
    const prevOrder = subjectOrderMap.get(row.subject);
    if (!prevOrder || compareSubjectSortKeyValue(sortKeyValue, prevOrder) < 0) {
      subjectOrderMap.set(row.subject, sortKeyValue);
    }

    const cellKey = getCellKey(courseData.day, courseData.period[0]);
    if (!coursesByCellMap.has(cellKey)) {
      coursesByCellMap.set(cellKey, new Set());
    }
    coursesByCellMap.get(cellKey)!.add(courseCode);
  });

  return { courseEntriesByCode, subjectCourseMap, subjectOrderMap, coursesByCellMap };
};

const createSubjectOrderList = (
  subjectOrderMap: Map<string, SubjectSortKeyValue>,
  subjectCourseMap: Map<string, Set<string>>,
): string[] => {
  const orderedSubjects = Array.from(subjectOrderMap.entries())
    .sort((a, b) => compareSubjectSortKeyValue(a[1], b[1]))
    .map(([subject]) => subject);
  const remainingSubjects = Array.from(subjectCourseMap.keys())
    .filter(subject => !subjectOrderMap.has(subject))
    .sort();
  return [...orderedSubjects, ...remainingSubjects];
};

const mapSubjectCourseCodesFromOrder = (
  subjectOrder: string[],
  subjectCourseMap: Map<string, Set<string>>,
): Record<string, string[]> => {
  return subjectOrder.reduce<Record<string, string[]>>((acc, subject) => {
    const codes = Array.from(subjectCourseMap.get(subject) ?? []);
    codes.sort(compareCourseCodes);
    acc[subject] = codes;
    return acc;
  }, {});
};

const mapCoursesByCellKeyRecord = (coursesByCellMap: Map<string, Set<string>>): Record<string, string[]> => {
  const coursesByCellKey: Record<string, string[]> = {};
  coursesByCellMap.forEach((codes, key) => {
    coursesByCellKey[key] = Array.from(codes).sort(compareCourseCodes);
  });
  return coursesByCellKey;
};

export function buildCourseList(rows: CourseList[]) {
  const collections = collectListCollections(rows);
  const subjectOrder = createSubjectOrderList(collections.subjectOrderMap, collections.subjectCourseMap);
  const subjectCourseCodes = mapSubjectCourseCodesFromOrder(subjectOrder, collections.subjectCourseMap);
  const coursesByCellKey = mapCoursesByCellKeyRecord(collections.coursesByCellMap);

  return {
    courseEntriesByCode: collections.courseEntriesByCode,
    subjectCourseCodes,
    subjectOrder,
    coursesByCellKey,
  };
}
