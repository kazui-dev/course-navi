import { create } from 'zustand';
import { dbClient } from '@/services/dbClient';
import type { UserProfile } from '@/types';
import { validatePrerequisites } from '@/utils';
import { useTranscriptsStore } from './useTranscriptsStore';

import { useHighlightStore } from './useHighlightStore';
import { useCellStateStore } from './useCellStateStore';
import { localBackup, StoredUserProfile } from '@/services/localBackup';


// 設定ストアの状態
interface SettingsState {
  currentYear: number | null;
  availableYearsFromSectionTimes: number[];
  availableYearsForTranscripts: number[];
  currentClass: string | null;
  availableClasses: string[];
  allCourses: { course: string, abbr: string, alias: string[] }[];
  isSettingsLoading: boolean;
  currentAllowedCourses: Set<string> | null;
  isAllowedComputed: boolean;
}

// 設定ストアの操作群
interface SettingsActions {
  loadInitialData: () => Promise<void>;
  setCurrentYear: (newYear: number) => Promise<void>;
  setCurrentClass: (newClass: string | null) => Promise<void>;
  recomputeAllowedCourses: (year?: number) => Promise<void>;
}

// ストア全体の型
type SettingsStore = SettingsState & SettingsActions;

type YearResources = {
  profile: UserProfile | null;
  allCourses: { course: string, abbr: string, alias: string[] }[];
  availableClasses: string[];
};

// localStorage から保存された年度を読み出す（例外時は null を返す）
const readSavedYear = (): number | null => {
  try {
    const saved = localStorage.getItem('currentYear');
    return saved ? parseInt(saved, 10) : null;
  } catch {
    return null;
  }
};

// 使用可能な年度リストからデフォルト年度を選ぶ
const pickDefaultYear = (years: number[], savedYear: number | null, fallbackYear: number): number => {
  if (years.length === 0) return fallbackYear;
  if (savedYear && years.includes(savedYear)) return savedYear;
  return years[0];
};

import { buildClassName, parseClassName } from '@/utils';

// ---------------------------
// ヘルパー: 年度リソース取得
// ---------------------------
// 指定年度に必要なリソースを並列取得するユーティリティ
const fetchYearResources = (year: number): Promise<YearResources> => {
  return Promise.all([
    dbClient.fetchUserProfile(year),
    dbClient.fetchAllCourseNames(year),
    dbClient.fetchAvailableClasses(year),
  ]).then(([profile, allCourses, availableClasses]) => ({ profile, allCourses, availableClasses }));
};

// 年度に関する state を組み立てる（resources は fetchYearResources の結果）
const buildYearState = (year: number, resources: YearResources) => ({
  currentYear: year,
  currentClass: buildClassName(resources.profile),
  allCourses: resources.allCourses,
  availableClasses: resources.availableClasses,
  isSettingsLoading: false,
  currentAllowedCourses: null,
  isAllowedComputed: false,
});

// ---------------------------
// ヘルパー: 可否判定ロジックを共通化
// ---------------------------
// 指定年度と科目名配列から、前提条件に合致する科目名の Set を返す
const computeAllowedCourseSet = async (year: number, courseNames: string[]): Promise<Set<string>> => {
  const allowedSet = new Set<string>();
  try {
    const transcriptsStore = useTranscriptsStore.getState();
    if (!transcriptsStore.isDataLoaded) {
      await transcriptsStore.loadTranscripts();
    }
    const transcripts = useTranscriptsStore.getState().transcripts;

    // 並列で前提判定を行い、通過した科目を allowedSet に追加
    await Promise.all(courseNames.map(async (name) => {
      try {
        const violation = await validatePrerequisites({ courseName: name, year, transcripts });
        if (!violation) allowedSet.add(name);
      } catch (err) {
        // 判定中に例外が発生した場合は保守的に許容
        allowedSet.add(name);
      }
    }));
  } catch (err) {
    console.error('Failed to compute allowed courses', err);
  }
  return allowedSet;
};

// ---------------------------
// ヘルパー: 使用可能年度の取得
// ---------------------------
// Timetable 用: section_times ベースの年度を取得（存在しなければ transcripts ベースをフォールバック）
const fetchAvailableYearsForTimetable = async (): Promise<number[]> => {
  if (typeof dbClient.fetchAvailableYearsForTimetable === 'function') {
    return dbClient.fetchAvailableYearsForTimetable();
  }
  return dbClient.fetchAvailableYearsForTranscripts();
};

// Transcripts 用: 通常の sections ベースで年度を取得
const fetchAvailableYearsForTranscripts = async (): Promise<number[]> => {
  return dbClient.fetchAvailableYearsForTranscripts();
};



export const useSettingsStore = create<SettingsStore>((set, get) => ({
  currentYear: null,
  availableYearsFromSectionTimes: [],
  availableYearsForTranscripts: [],
  currentClass: null,
  availableClasses: [],
  allCourses: [],
  isSettingsLoading: true,
  currentAllowedCourses: null,
  isAllowedComputed: false,

  // 初回ロード: 使用可能な年度一覧を取得し、デフォルト年度のリソースをロードする
  loadInitialData: async () => {
    set({ isSettingsLoading: true });
    try {
      // Timetable で使う年度一覧は section_times ベースを使用
      const years = await fetchAvailableYearsForTimetable();
      // Transcripts（通常の sections ベース）で使う年度一覧を別途取得
      const transcriptsYears = await fetchAvailableYearsForTranscripts();
      const fallbackYear = new Date().getFullYear();
      const defaultYear = pickDefaultYear(years, readSavedYear(), fallbackYear);
      let resources = await fetchYearResources(defaultYear);

      // DB 側に user_profile が一件も存在しない場合、localBackup に保存された全プロフィールを復元する
      // 全年度の profile を取得して、何も存在しなければ復元を試みる
      try {
        const profile = await Promise.all(transcriptsYears.map(y => dbClient.fetchUserProfile(y)));
        const anyExists = profile.some(p => p !== null);
        if (!anyExists) {
          const backupAll = localBackup.loadUserProfile();
          if (backupAll && backupAll.length > 0) {
            try {
              for (const entry of backupAll) {
                const p = entry.profile;
                if (p) {
                  await dbClient.upsertUserProfile(entry.year, p.department, p.division, p.class);
                }
              }
              // 再取得
              resources = await fetchYearResources(defaultYear);
            } catch (err) {
              console.error('Failed to restore user profile from local backup:', err);
            }
          }
        }
      } catch (err) {
        console.error('Error checking existing user profile:', err);
      }

      const courseNames = resources.allCourses.map(c => c.course);
      const allowedSet = await computeAllowedCourseSet(defaultYear, courseNames);

      set({
        availableYearsFromSectionTimes: years.length > 0 ? years : [defaultYear],
        availableYearsForTranscripts: transcriptsYears.length > 0 ? transcriptsYears : [defaultYear],
        ...buildYearState(defaultYear, resources),
        currentAllowedCourses: allowedSet,
        isAllowedComputed: true,
      });

      // localBackup に現在の全プロフィールを保存（fire-and-forget）
      try {
        const entries: { year: number; profile: UserProfile }[] = [];
        for (const y of transcriptsYears) {
          try {
            const p = await dbClient.fetchUserProfile(y);
            if (p) entries.push({ year: y, profile: p });
          } catch (_e) {
            // ignore single-year errors
          }
        }
        localBackup.saveUserProfile(entries).catch(() => { });
      } catch (_e) {
        // ignore
      }

    } catch (error) {
      console.error(error);
      const year = new Date().getFullYear();
      set({
        availableYearsFromSectionTimes: [year],
        availableYearsForTranscripts: [year],
        currentYear: year,
        isSettingsLoading: false
      });
    }
  },

  // 年度変更ハンドラ: ハイライトやセル選択をリセットしてから新年度のリソースを読み込む
  setCurrentYear: async (newYear) => {
    if (newYear === get().currentYear) {
      return;
    }

    useHighlightStore.getState().setPreviewHighlight(null);
    useHighlightStore.getState().setSearchHighlight(null);
    useCellStateStore.getState().resetCellState();

    set({ currentYear: newYear, isSettingsLoading: true });
    localStorage.setItem('currentYear', newYear.toString());

    try {
      const resources = await fetchYearResources(newYear);
      const courseNames = resources.allCourses.map(c => c.course);
      const allowedSet = await computeAllowedCourseSet(newYear, courseNames);

      set({
        ...buildYearState(newYear, resources),
        currentAllowedCourses: allowedSet,
        isAllowedComputed: true,
      });
    } catch (error) {
      console.error(error);
      set({ isSettingsLoading: false });
    }
  },

  // クラス設定を更新し、プロフィールを DB に保存してから allowedCourses を再計算
  setCurrentClass: async (newClass) => {
    const year = get().currentYear;
    set({ currentClass: newClass });
    if (!year || !newClass || newClass.length < 3) return;
    try {
      const parsed = parseClassName(newClass);
      if (!parsed) return;
      await dbClient.upsertUserProfile(year, parsed.department, parsed.division, parsed.classNum);
      // クラス変更後に前提条件を再計算
      try {
        await get().recomputeAllowedCourses(year);
      } catch (err) {
        console.error('Failed to recomputeAllowedCourses after class change', err);
      }
      // localBackup に最新プロフィールを保存（fire-and-forget）
      try {
        // ローカルバックアップの配列を読み込み、今回の年度エントリを更新して保存
        const all = localBackup.loadUserProfile() || [];
        const filtered = all.filter((e: StoredUserProfile) => e.year !== year);
        const profileEntry = { year: year as number, profile: { department: parsed.department, division: parsed.division, class: parsed.classNum, is_graduating_year: 0 } };
        filtered.push(profileEntry);
        localBackup.saveUserProfile(filtered).catch(() => { });
      } catch (_e) {
        // ignore
      }
    } catch (error) {
      console.error(error);
    }
  },

  // 指定年度（または現在年度）について allowed courses を再計算する
  recomputeAllowedCourses: async (year) => {
    const targetYear = year ?? get().currentYear;
    if (!targetYear) return;
    set({ isSettingsLoading: true });
    try {
      const resources = await fetchYearResources(targetYear);
      const courseNames = resources.allCourses.map(c => c.course);
      const allowedSet = await computeAllowedCourseSet(targetYear, courseNames);

      set({
        ...buildYearState(targetYear, resources),
        currentAllowedCourses: allowedSet,
        isAllowedComputed: true,
      });
    } catch (err) {
      console.error('Failed to fetch resources during recomputeAllowedCourses', err);
      set({ isSettingsLoading: false });
    }
  },

}));