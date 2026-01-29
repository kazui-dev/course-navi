import { create } from "zustand";
import { toastService } from "@/lib/toast";
import { dbClient } from "@/services/dbClient";
import type {
  CellData,
  CourseData,
  CourseDataMap,
  CourseListEntry,
  CourseMetadata,
  Timetable,
  TimetableCodesTable,
} from "@/types";
import {
  calculateCredits,
  convertTimetableToCodes,
  createEmptyTimetable,
  deleteCourse,
  restoreTimetableFromCodes,
  validatePrerequisites,
} from "@/utils";
import { buildCourseList } from "@/utils/timetableUtils";

import { useCellStateStore } from "./useCellStateStore";
import { useHighlightStore } from "./useHighlightStore";
import { useTranscriptsStore } from "./useTranscriptsStore";

// 履歴エントリ: 時間割本体とシリアライズ済みコード表
interface HistoryEntry {
  table: Timetable;
  codesTable: TimetableCodesTable;
  codesJson: string;
}

// Timetable ストアの状態
interface TimetableState {
  timetable: Timetable;
  history: HistoryEntry[];
  historyIndex: number;
  isLoading: boolean;
  currentYear: number | null;
  totalCredits: number;
  canUndo: boolean;
  canRedo: boolean;
  courseEntriesByCode: Record<string, CourseListEntry>;
  subjectCourseCodes: Record<string, string[]>;
  subjectOrder: string[];
  coursesByCellKey: Record<string, string[]>;
  courseListYear: number | null;
  isCourseListLoading: boolean;
  courseMetadataByName: Record<string, CourseMetadata | undefined>;
}

// Timetable ストアの操作（公開 API）
interface TimetableActions {
  // 内部 API: 時間割と履歴を一括で設定する
  _setTimetableAndHistory: (newTable: Timetable, fromHistory?: boolean) => void;
  loadInitialTimetable: (year: number | null) => Promise<void>;
  handleUndo: () => void;
  handleRedo: () => void;
  // 登録処理: 前提/単位上限チェックを行い、場合によっては blocked を返す
  register: (
    data: CourseData[],
    currentCell: CellData | null,
    force?: boolean,
  ) => Promise<{
    success: boolean;
    blocked?: true;
    message?: string;
  }>;

  // 授業を登録解除する
  unregister: (cellToDelete: CellData) => void;

  clearTimetable: () => void;
  restoreTimetableSnapshot: (snapshot: Timetable) => void;
  loadTimetableFromSave: (
    codesTable: TimetableCodesTable,
    year: number,
  ) => Promise<void>;
  loadCourseList: (year: number | null) => Promise<void>;
  applyHomeroomCourses: (className: string | null) => Promise<void>;
  isCourseAtMax: (courseName: string, upToYear?: number) => boolean;
  getVisibleCoursesForCell: (
    cellKey: string,
    opts: {
      hideAcquired: boolean;
      filterPrereqs: boolean;
      allowedCourses?: Set<string> | null;
      isAllowedComputed?: boolean;
      currentYear?: number | null;
    },
  ) => { subject: string; entries: CourseData[][] }[];
}

// ストア全体の型
type TimetableStore = TimetableState & TimetableActions;

const focusCell = (day: number, period: number) => {
  useCellStateStore.getState().handleCellSelect({ day, period: [period] });
};

const focusCellAfterRegister = (
  data: CourseData[],
  currentCell: CellData | null,
) => {
  if (!currentCell || currentCell.day === null) {
    return;
  }
  const matchedDay = data.find((d) => d.day === currentCell.day) ?? data[0];
  const targetPeriod = matchedDay?.period?.[0];
  if (matchedDay && targetPeriod) {
    focusCell(matchedDay.day, targetPeriod);
  }
};

const focusCellAfterUnregister = (cell: CellData) => {
  if (cell.day === null || !cell.period || cell.period.length === 0) {
    return;
  }
  focusCell(cell.day, cell.period[0]);
};

const resetSearchHighlight = () => {
  useHighlightStore.getState().setSearchHighlight(null);
};

/**
 * [内部ヘルパー] IDテーブルから時間割データを復元する
 */
const _loadTimetableFromCodes = async (
  codesTable: TimetableCodesTable,
  year: number | null,
): Promise<Timetable> => {
  let newTable = createEmptyTimetable();
  if (!codesTable || !year) {
    return newTable;
  }
  try {
    const uniqueCodes = new Set<string>();
    codesTable.forEach((row) => {
      row.forEach((code) => {
        if (code) uniqueCodes.add(code);
      });
    });
    const codes = Array.from(uniqueCodes);
    if (codes.length > 0) {
      const courseDataLists = await dbClient.fetchCourseDataByCodes(
        codes,
        year,
      );
      const courseDataMap: CourseDataMap = new Map();
      courseDataLists.forEach((dataList) => {
        if (dataList.length > 0) {
          courseDataMap.set(dataList[0].code, dataList);
        }
      });
      newTable = restoreTimetableFromCodes(codesTable, courseDataMap);
    }
  } catch (error) {
    console.error(error);
  }
  return newTable;
};

const AUTOSAVE_KEY_PREFIX = "autosavedTimetable_";

const getAutosaveKey = (year: number) => `${AUTOSAVE_KEY_PREFIX}${year}`;

const readAutosavedCodesTable = (year: number): TimetableCodesTable | null => {
  try {
    const autosavedJson = localStorage.getItem(getAutosaveKey(year));
    return autosavedJson ? JSON.parse(autosavedJson) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const restoreAutosavedTimetable = async (year: number): Promise<Timetable> => {
  const codesTable = readAutosavedCodesTable(year);
  if (!codesTable) {
    return createEmptyTimetable();
  }
  return _loadTimetableFromCodes(codesTable, year);
};

const emptyListState = () => ({
  courseEntriesByCode: {},
  subjectCourseCodes: {},
  subjectOrder: [],
  coursesByCellKey: {},
  courseListYear: null,
  isCourseListLoading: false,
  courseMetadataByName: {},
});

const createHistoryEntry = (table: Timetable): HistoryEntry => {
  const codesTable = convertTimetableToCodes(table);
  return {
    table,
    codesTable,
    codesJson: JSON.stringify(codesTable),
  };
};

// Timetable ストアの実装
export const useTimetableStore = create<TimetableStore>((set, get) => {
  /** [内部ヘルパー] オートセーブ */
  const _autoSave = (entry: HistoryEntry) => {
    try {
      const year = get().currentYear;
      if (year !== null) {
        localStorage.setItem(getAutosaveKey(year), entry.codesJson);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const updateStateWithHistory = (
    entry: HistoryEntry,
    history: HistoryEntry[],
    historyIndex: number,
  ) => {
    const { table } = entry;
    const totalCredits = calculateCredits(table);
    if (historyIndex > 0) {
      _autoSave(entry);
    }
    set({
      timetable: table,
      history,
      historyIndex,
      totalCredits,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
    });
  };

  const applyInitialTable = (timetable: Timetable) => {
    const entry = createHistoryEntry(timetable);
    updateStateWithHistory(entry, [entry], 0);
    set({ isLoading: false });
  };

  const createInitialHistory = () => [
    createHistoryEntry(createEmptyTimetable()),
  ];

  return {
    timetable: createEmptyTimetable(),
    history: createInitialHistory(),
    historyIndex: 0,
    isLoading: true,
    currentYear: null,
    totalCredits: 0,
    canUndo: false,
    canRedo: false,
    courseEntriesByCode: {},
    subjectCourseCodes: {},
    subjectOrder: [],
    coursesByCellKey: {},
    courseListYear: null,
    isCourseListLoading: false,
    courseMetadataByName: {},

    // 時間割と履歴を更新する内部ヘルパー
    _setTimetableAndHistory: (newTable, fromHistory = false) => {
      const state = get();
      if (state.isLoading && !fromHistory) return;

      const newEntry = createHistoryEntry(newTable);
      let history = state.history;
      let historyIndex = state.historyIndex;

      if (!fromHistory) {
        const currentEntry = history[historyIndex];
        if (currentEntry && currentEntry.codesJson === newEntry.codesJson)
          return;
        history = history.slice(0, historyIndex + 1).concat([newEntry]);
        historyIndex = history.length - 1;
      } else {
        history = history.slice();
        history[historyIndex] = newEntry;
      }

      updateStateWithHistory(newEntry, history, historyIndex);
    },
    // 初期時間割のロード: コース一覧を先に読み、オートセーブがあれば復元する
    loadInitialTimetable: async (year) => {
      set({
        isLoading: true,
        history: createInitialHistory(),
        historyIndex: 0,
        currentYear: year,
      });

      // まずコースリストを読み込む（表示に必要）
      await get().loadCourseList(year);

      if (year === null) {
        applyInitialTable(createEmptyTimetable());
        return;
      }

      try {
        const initialTable = await restoreAutosavedTimetable(year);
        applyInitialTable(initialTable);
      } catch (error) {
        console.error(error);
        applyInitialTable(createEmptyTimetable());
      }
    },
    handleUndo: () => {
      const { historyIndex, history } = get();
      const prevIndex = historyIndex - 1;
      if (prevIndex < 0) return;
      updateStateWithHistory(history[prevIndex], history, prevIndex);
    },
    handleRedo: () => {
      const { historyIndex, history } = get();
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) return;
      updateStateWithHistory(history[nextIndex], history, nextIndex);
    },
    // 科目登録処理
    // - 前提条件チェック
    // - 単位上限チェック
    // - 実際の時間割変更（delete/overwrite を含む）
    register: async (
      data: CourseData[],
      currentCell: CellData | null,
      force = false,
    ): Promise<{ success: boolean; blocked?: true; message?: string }> => {
      if (!data || data.length === 0) {
        return { success: false } as const;
      }

      const primaryCourse = data[0];
      const courseName = primaryCourse?.course;
      const registrationYear = primaryCourse?.year ?? get().currentYear;
      if (!courseName || typeof registrationYear !== "number") {
        return { success: false } as const;
      }

      // 前提条件チェック: 履修 / 修得データを参照して違反がないか確認する
      // - validatePrerequisites は外部ユーティリティ。
      // - ここでエラーになった場合は UX を阻害しないために許容する設計になっている
      try {
        const transcriptsStore = useTranscriptsStore.getState();
        if (!transcriptsStore.isDataLoaded) {
          await transcriptsStore.loadTranscripts();
        }
        const violation = await validatePrerequisites({
          courseName,
          year: registrationYear,
          transcripts: transcriptsStore.transcripts,
        });
        if (violation && !force) {
          const formattedDescription = violation.description
            .replace(/ かつ /g, "\nかつ ")
            .replace(/ または /g, "\nまたは ");
          return {
            success: false,
            blocked: true,
            message: formattedDescription,
          } as const;
        }
      } catch (error) {
        console.error("Prerequisite pre-check failed:", error);
      }

      // --- 単位上限チェック（事前判定） ---
      // 取得済み単位とコースメタデータを参照し、既に上限に達している場合は拒否、
      // 追加すると上限を超える場合は確認が必要（blocked を返す）
      try {
        const transcriptsStore = useTranscriptsStore.getState();
        if (!transcriptsStore.isDataLoaded) {
          await transcriptsStore.loadTranscripts();
        }
        const courseMetadata =
          await dbClient.fetchCourseMetadata(registrationYear);
        const acquiredSum = useTranscriptsStore
          .getState()
          .getAcquiredCredits(courseName, {
            upToYear: registrationYear,
            includeExclusiveGroup: true,
            includeSameYear: false,
            courseMetadata: courseMetadata,
          });
        const addCredits = primaryCourse.credits || 0;
        const metadata = courseMetadata.find((c) => c.course === courseName);
        const explicitMax = metadata?.max_credits;
        if (explicitMax !== null && explicitMax !== undefined) {
          const maxCredits = explicitMax ?? metadata?.credits ?? addCredits;
          // 条件2: 既に上限達成している場合は即拒否（確認なし）
          if (acquiredSum >= maxCredits) {
            toastService.error({
              title: `繰り返し履修違反: ${courseName}`,
              description: "修得済みの科目です。",
            });
            return { success: false } as const;
          }
          // 条件1: 追加すると上限を超える場合は確認が必要
          if (acquiredSum + addCredits > maxCredits) {
            // force が true の場合は確認をスキップして登録を続行
            if (!force) {
              // 戻り値に確認用情報を含め、UI側で ConfirmModal を表示させる
              return {
                success: false,
                blocked: true,
                confirmType: "maxCredits" as unknown as string,
                message: `${acquiredSum}|${maxCredits}`,
              } as unknown as {
                success: boolean;
                blocked?: true;
                message?: string;
              };
            }
          }
        }
      } catch (error) {
        console.error(error);
      }

      const { timetable, _setTimetableAndHistory } = get();
      let newTable = structuredClone(timetable);
      const courseCodeToRegister = data[0]?.code;
      data.forEach((courseData) => {
        const { day, period } = courseData;
        const primaryPeriod = period[0];
        const existingCourse = newTable[primaryPeriod - 1][day];
        if (
          existingCourse !== "" &&
          existingCourse.code !== courseCodeToRegister
        ) {
          newTable = deleteCourse(newTable, existingCourse);
        }
        period.forEach((p) => {
          newTable[p - 1][day] = courseData;
        });
      });
      _setTimetableAndHistory(newTable);
      resetSearchHighlight();
      focusCellAfterRegister(data, currentCell);

      return { success: true } as const;
    },

    unregister: (cellToDelete: CellData) => {
      const { timetable, _setTimetableAndHistory } = get();
      const day = cellToDelete.day;
      if (day === null || !cellToDelete.period) return;
      const period = cellToDelete.period[0];
      const courseToDelete = timetable[period - 1][day];

      if (courseToDelete === "") return; // 既に空なら何もしない

      const newTable = deleteCourse(timetable, courseToDelete);
      _setTimetableAndHistory(newTable);
      focusCellAfterUnregister(cellToDelete);
    },

    clearTimetable: () => {
      get()._setTimetableAndHistory(createEmptyTimetable());
    },

    restoreTimetableSnapshot: (snapshot) => {
      const clone = structuredClone(snapshot);
      get()._setTimetableAndHistory(clone);
    },

    loadTimetableFromSave: async (codesTable, year) => {
      set({ currentYear: year });
      const newTable = await _loadTimetableFromCodes(codesTable, year);
      get()._setTimetableAndHistory(newTable);
    },

    loadCourseList: async (year) => {
      if (!year) {
        set(emptyListState());
        return;
      }

      set({ isCourseListLoading: true });
      try {
        const rows = await dbClient.fetchCourseList(year);
        const courseList = buildCourseList(rows);
        const metadata = await dbClient.fetchCourseMetadata(year);
        const metadataMap: Record<string, CourseMetadata | undefined> = {};
        metadata.forEach((m) => {
          if (m.course) metadataMap[m.course] = m;
        });
        set({
          courseEntriesByCode: courseList.courseEntriesByCode,
          subjectCourseCodes: courseList.subjectCourseCodes,
          subjectOrder: courseList.subjectOrder,
          coursesByCellKey: courseList.coursesByCellKey,
          courseListYear: year,
          isCourseListLoading: false,
          courseMetadataByName: metadataMap,
        });
      } catch (error) {
        console.error(error);
        set(emptyListState());
      }
    },

    isCourseAtMax: (courseName: string, upToYear?: number) => {
      try {
        const metadata = get().courseMetadataByName?.[courseName];
        const explicitMax = metadata?.max_credits;
        if (explicitMax === null) return false;
        const maxCredits = explicitMax ?? metadata?.credits ?? 0;
        if (!maxCredits || maxCredits <= 0) return false;
        const metadataArray = Object.values(get().courseMetadataByName).filter(
          Boolean,
        ) as CourseMetadata[];
        const acquired = useTranscriptsStore
          .getState()
          .getAcquiredCredits(courseName, {
            upToYear,
            includeExclusiveGroup: true,
            includeSameYear: false,
            courseMetadata: metadataArray,
          });
        return acquired >= maxCredits;
      } catch (error) {
        console.error("isCourseAtMax error:", error);
        return false;
      }
    },
    applyHomeroomCourses: async (className) => {
      const year = get().currentYear;
      if (!className || year === null) {
        return;
      }
      try {
        const homeroomCourses = await dbClient.fetchHomeroomCourseData(
          className,
          year,
        );
        if (homeroomCourses.length === 0) {
          return;
        }
        try {
          const { timetable, _setTimetableAndHistory } = get();
          let newTable = structuredClone(timetable);
          for (let r = 0; r < newTable.length; r++) {
            for (let c = 0; c < newTable[r].length; c++) {
              const cell = newTable[r][c];
              if (cell !== "") {
                const courseCell = cell as CourseData;
                if (courseCell.course === "ホームルーム") {
                  newTable = deleteCourse(newTable, courseCell);
                }
              }
            }
          }

          const courseCodeToRegister = homeroomCourses[0]?.code;
          homeroomCourses.forEach((courseData) => {
            const { day, period } = courseData;
            const primaryPeriod = period[0];
            const existingCourse = newTable[primaryPeriod - 1][day];
            if (
              existingCourse !== "" &&
              existingCourse.code !== courseCodeToRegister
            ) {
              newTable = deleteCourse(newTable, existingCourse);
            }
            period.forEach((p) => {
              newTable[p - 1][day] = courseData;
            });
          });

          _setTimetableAndHistory(newTable);
          resetSearchHighlight();
          focusCellAfterRegister(homeroomCourses, null);
        } catch (err) {
          console.error(
            "Failed to apply homeroom courses in single history operation",
            err,
          );
          await get().register(homeroomCourses, null, true);
        }
      } catch (error) {
        console.error(error);
      }
    },

    /**
     * セルキーに対して表示すべきコース群をまとめて返す
     * - hideAcquired: 上限に達しているコースを除外
     * - filterPrereqs: 前提条件フィルタ（allowedCourses を利用）
     */
    getVisibleCoursesForCell: (
      cellKey: string,
      opts: {
        hideAcquired: boolean;
        filterPrereqs: boolean;
        allowedCourses?: Set<string> | null;
        isAllowedComputed?: boolean;
        currentYear?: number | null;
      },
    ) => {
      const {
        hideAcquired,
        filterPrereqs,
        allowedCourses,
        isAllowedComputed,
        currentYear,
      } = opts;
      const codes = get().coursesByCellKey[cellKey] ?? [];
      if (codes.length === 0)
        return [] as { subject: string; entries: CourseData[][] }[];

      const codesInCell = new Set(codes);
      const subjectOrder = get().subjectOrder;
      const subjectCourseCodes = get().subjectCourseCodes;
      const courseEntriesByCode = get().courseEntriesByCode;

      const groups = subjectOrder.reduce<
        { subject: string; entries: CourseData[][] }[]
      >(
        (acc, subject) => {
          const subjectCodes = subjectCourseCodes[subject] ?? [];
          const entries = subjectCodes.reduce<CourseData[][]>(
            (collection, courseCode) => {
              if (!codesInCell.has(courseCode)) return collection;
              const rows = courseEntriesByCode[courseCode]?.rows ?? [];
              if (rows.length === 0) return collection;
              const courseName = rows[0].course;

              if (
                hideAcquired &&
                get().isCourseAtMax(courseName, currentYear ?? undefined)
              ) {
                return collection;
              }

              if (filterPrereqs && isAllowedComputed && allowedCourses) {
                if (!allowedCourses.has(courseName)) return collection;
              }

              collection.push(rows);
              return collection;
            },
            [],
          );

          if (entries.length > 0) {
            acc.push({ subject, entries });
          }
          return acc;
        },
        [] as { subject: string; entries: CourseData[][] }[],
      );

      return groups;
    },
  };
});
