import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseDetail, CourseList, Timetable, ToolsTop } from "@/components";

import {
  useCellStateStore,
  useCourseSearchStore,
  useSettingsStore,
  useTimetableStore,
  useTranscriptsStore,
} from "@/stores";
import type {
  CellData,
  CourseData,
  CourseDetailData,
  CourseListEntry,
  Timetable as TimetableMatrix,
} from "@/types";

type SelectedCell = CellData & { day: number; period: number[] };

const hasValidCellSelection = (cell: CellData): cell is SelectedCell => {
  return (
    cell.day !== null && Array.isArray(cell.period) && cell.period.length > 0
  );
};

const getCourseCodeFromCell = (
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
  const row = timetable[primaryPeriod - 1];
  const cellCourse = row?.[cell.day];
  if (!cellCourse || typeof cellCourse === "string") {
    return null;
  }
  return cellCourse.code;
};

const buildCourseDetail = (
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

export default function TimetablePage() {
  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(
    null,
  );

  // Settings Store
  const currentYear = useSettingsStore((state) => state.currentYear);
  const setCurrentYear = useSettingsStore((state) => state.setCurrentYear);
  const setCurrentClass = useSettingsStore((state) => state.setCurrentClass);

  // Timetable Store
  const register = useTimetableStore((state) => state.register);
  const unregister = useTimetableStore((state) => state.unregister);
  const clearTimetable = useTimetableStore((state) => state.clearTimetable);
  const timetable = useTimetableStore((state) => state.timetable);
  const courseEntriesByCode = useTimetableStore(
    (state) => state.courseEntriesByCode,
  );

  const clickedCell = useCellStateStore((state) => state.clickedCell);

  const transcriptStatusByCourseName = useTranscriptsStore(
    (state) => state.statusByCourseName,
  );
  const loadTranscripts = useTranscriptsStore((state) => state.loadTranscripts);
  const areTranscriptsLoaded = useTranscriptsStore(
    (state) => state.isDataLoaded,
  );
  const requestCourseSearchAutoFill = useCourseSearchStore(
    (state) => state.requestAutoFill,
  );

  const handleClearCourseDetail = useCallback(() => {
    setSelectedCourseCode(null);
  }, []);

  const handleShowCourseDetail = useCallback(
    (courseCode: string) => {
      const entry = courseEntriesByCode[courseCode];
      if (!entry || entry.rows.length === 0) {
        setSelectedCourseCode(null);
        return;
      }
      setSelectedCourseCode(courseCode);
    },
    [courseEntriesByCode],
  );

  const clickedPeriodKey = clickedCell.period
    ? clickedCell.period.join(",")
    : "";
  const detailSelectionKey = hasValidCellSelection(clickedCell)
    ? `${clickedCell.day}-${clickedPeriodKey}`
    : null;

  const selectedCellCourseCode = useMemo(() => {
    return getCourseCodeFromCell(clickedCell, timetable);
  }, [clickedCell, timetable]);

  useEffect(() => {
    if (detailSelectionKey === null || selectedCellCourseCode === null) {
      handleClearCourseDetail();
      return;
    }
    if (!courseEntriesByCode[selectedCellCourseCode]) {
      return;
    }
    handleShowCourseDetail(selectedCellCourseCode);
  }, [
    detailSelectionKey,
    selectedCellCourseCode,
    courseEntriesByCode,
    handleClearCourseDetail,
    handleShowCourseDetail,
  ]);

  useEffect(() => {
    if (!areTranscriptsLoaded) {
      loadTranscripts();
    }
  }, [areTranscriptsLoaded, loadTranscripts]);

  const selectedCourseDetail = useMemo(
    () =>
      buildCourseDetail(
        selectedCourseCode,
        courseEntriesByCode,
        transcriptStatusByCourseName,
      ),
    [selectedCourseCode, courseEntriesByCode, transcriptStatusByCourseName],
  );

  const handleAutoFillCourseSearch = useCallback(
    (courseName: string) => {
      if (!courseName) {
        return;
      }
      requestCourseSearchAutoFill(courseName);
    },
    [requestCourseSearchAutoFill],
  );

  const handleRegister = async (
    currentCellData: CellData | null,
    data: CourseData[],
    force = false,
  ) => {
    return await register(data, currentCellData, force);
  };

  const handleYearChange = (newYear: string | number) => {
    const yearAsNumber =
      typeof newYear === "string" ? parseInt(newYear, 10) : newYear;

    if (yearAsNumber !== currentYear) {
      setCurrentYear(yearAsNumber);
    }
  };

  const handleClassChange = async (newClass: string | null) => {
    await setCurrentClass(newClass);
  };

  return (
    <div className="px-6 py-4 h-full overflow-auto">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="mb-6">
            <ToolsTop />
          </div>
          <Timetable
            onYearChange={handleYearChange}
            onClassChange={handleClassChange}
            onClearTimetable={clearTimetable}
          />
        </div>
        <div className="flex flex-col">
          <div className="flex items-start gap-4">
            <div className="border border-gray-200 rounded-sm p-4 w-72">
              <CourseList
                register={handleRegister}
                currentYear={currentYear}
                unregister={unregister}
                onShowDetail={handleShowCourseDetail}
                onClearDetail={handleClearCourseDetail}
                activeDetailCode={selectedCourseCode}
              />
            </div>
            {selectedCourseDetail && (
              <div className="w-80">
                <CourseDetail
                  detail={selectedCourseDetail}
                  isLoading={false}
                  onFillCourseSearch={handleAutoFillCourseSearch}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
