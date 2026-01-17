import { create } from 'zustand';
import { dbClient } from '@/services/dbClient';
import type { TranscriptData, DbResult, NewTranscriptData, CourseMetadata } from '@/types';
import { useSettingsStore } from './useSettingsStore';
import { localBackup } from '@/services/localBackup';

// 同時読み込みを防ぐための簡易ロック（プロミス）
let transcriptsLoadPromise: Promise<void> | null = null;

// 履修・修得データの状態
type TranscriptStatus = TranscriptData['status'];

interface TranscriptsState {
  transcripts: TranscriptData[]; // DB から読み込んだ全履修記録
  statusByCourseName: Record<string, TranscriptStatus>; // 科目ごとの最新ステータス
  acquiredCreditsByCourse: Record<string, number>; // 科目ごとの修得単位の集計（全期間）
  courseAbbrMap: Record<string, string>; // 科目名 -> 略称のマップ（表示用）
  isLoading: boolean;
  isDataLoaded: boolean;
  transcriptsVersion: number; // 変更通知用のバージョン
}

// ストア操作の定義
interface TranscriptsActions {
  // 履修データを DB から読み込む。force=true で強制再読み込み
  loadTranscripts: (force?: boolean) => Promise<void>;
  updateTranscript: (record: TranscriptData) => Promise<DbResult>;
  deleteTranscript: (id: number) => Promise<DbResult>;
  restoreTranscript: (record: TranscriptData) => Promise<DbResult>;
  addTranscripts: (records: NewTranscriptData[]) => Promise<DbResult>;
  // getAcquiredCredits: 年制限と排他グループを考慮した取得関数
  getAcquiredCredits: (courseName: string, opts: { upToYear?: number; includeExclusiveGroup: boolean; includeSameYear: boolean; courseMetadata?: CourseMetadata[] }) => number;
}

export const useTranscriptsStore = create<TranscriptsState & TranscriptsActions>((set, get) => {
  const initialState: TranscriptsState = {
    transcripts: [],
    statusByCourseName: {},
    acquiredCreditsByCourse: {},
    courseAbbrMap: {},
    isLoading: false,
    isDataLoaded: false,
    transcriptsVersion: 0,
  };

  // レコードを適用し、状態を更新するユーティリティ
  const applyRecords = (records: TranscriptData[], courseAbbrMap: Record<string, string>) => {
    const acquiredCreditsByCourse: Record<string, number> = {};
    records.forEach(r => {
      if (r.status === '修得') {
        acquiredCreditsByCourse[r.course_name] = (acquiredCreditsByCourse[r.course_name] || 0) + (r.credits || 0);
      }
    });
    set(state => ({
      transcripts: records,
      statusByCourseName: buildTranscriptStatusMap(records),
      acquiredCreditsByCourse,
      courseAbbrMap,
      isLoading: false,
      isDataLoaded: true,
      transcriptsVersion: (state.transcriptsVersion || 0) + 1,
    }));
    // 設定ストアに対して前提条件の再計算を通知（非同期で実行）
    try {
      const settings = useSettingsStore.getState();
      if (typeof settings.recomputeAllowedCourses === 'function') {
        // fire-and-forget: 即時 UI ブロックは避ける
        settings.recomputeAllowedCourses().catch(err => console.error('recomputeAllowedCourses error:', err));
      }
    } catch (err) {
      // ignore
    }
    // localBackup に最新を保存（fire-and-forget）
    try {
      localBackup.saveTranscripts(records).catch(() => { });
    } catch (_err) {
      // ignore
    }
  };

  // 履修記録から年度ごとの略称マップを構築するユーティリティ
  const buildCourseAbbreviationMap = async (records: TranscriptData[]): Promise<Record<string, string>> => {
    const years = Array.from(new Set(records.map(record => record.year)));
    if (years.length === 0) {
      return {};
    }
    try {
      const courseLists = await Promise.all(years.map(year => dbClient.fetchCourseMetadata(year)));
      return courseLists.reduce<Record<string, string>>((map, list) => {
        list.forEach(course => {
          if (course.course) {
            map[course.course] = course.abbr;
          }
        });
        return map;
      }, {});
    } catch (error) {
      console.error(error);
      return {};
    }
  };

  // DB 操作実行後、成功時に再読み込みするラッパー
  const reloadOnSuccess = async (operation: () => Promise<DbResult>) => {
    const result = await operation();
    if (result.success) {
      await get().loadTranscripts(true);
    }
    return result;
  };

  return {
    ...initialState,

    // DB から履修データを読み込む
    loadTranscripts: async (force = false) => {
      if (get().isDataLoaded && !force) {
        return;
      }

      if (transcriptsLoadPromise) {
        return transcriptsLoadPromise;
      }

      transcriptsLoadPromise = (async () => {
        set({ isLoading: true });
        try {
          let records = await dbClient.fetchTranscripts();

          // DB が空の場合、初回読み込みのときだけ localStorage のバックアップから復元を試みる
          // （再読み込みや強制リロード時には自動復元を行わない）
          if ((!records || records.length === 0) && !get().isDataLoaded) {
            const backup = localBackup.loadTranscripts();
            if (backup && backup.length > 0) {
              try {
                const newRecords = backup.map(mapTranscriptToNewRecord);
                await dbClient.insertTranscripts(newRecords);
                records = await dbClient.fetchTranscripts();
              } catch (err) {
                console.error('Failed to restore transcripts from local backup:', err);
                // DB 挿入に失敗した場合は UI 用にバックアップを使う
                records = backup;
              }
            }
          }

          const courseAbbrMap = await buildCourseAbbreviationMap(records);
          applyRecords(records, courseAbbrMap);
        } catch (error) {
          console.error(error);
          set({ isLoading: false });
        } finally {
          transcriptsLoadPromise = null;
        }
      })();

      return transcriptsLoadPromise;
    },

    updateTranscript: (record) => reloadOnSuccess(() => dbClient.updateTranscript(record)),

    deleteTranscript: (id) => reloadOnSuccess(() => dbClient.deleteTranscript(id)),

    restoreTranscript: (record) =>
      reloadOnSuccess(() => dbClient.insertTranscripts([mapTranscriptToNewRecord(record)])),

    addTranscripts: (records) => reloadOnSuccess(() => dbClient.insertTranscripts(records)),

    // 指定条件に従って修得単位数を返す
    getAcquiredCredits: (courseName: string, opts: { upToYear?: number; includeExclusiveGroup: boolean; includeSameYear: boolean; courseMetadata?: CourseMetadata[] }) => {
      const upToYear = opts.upToYear;
      const includeExclusive = opts.includeExclusiveGroup === true;
      const includeSameYear = opts.includeSameYear === true;

      // 高速経路: 年制限なし・排他展開なし
      if (typeof upToYear !== 'number' && !includeExclusive) {
        return get().acquiredCreditsByCourse[courseName] || 0;
      }

      // 年制限がある場合はフィルタして集計を作成
      const records = get().transcripts;
      const baseMap: Record<string, number> = {};
      records.forEach(r => {
        if (r.status !== '修得') return;
        if (typeof upToYear === 'number') {
          if (includeSameYear) {
            if (r.year <= upToYear) {
              baseMap[r.course_name] = (baseMap[r.course_name] || 0) + (r.credits || 0);
            }
          } else {
            if (r.year < upToYear) {
              baseMap[r.course_name] = (baseMap[r.course_name] || 0) + (r.credits || 0);
            }
          }
        } else {
          // 年制限なし: 全期間を含める
          baseMap[r.course_name] = (baseMap[r.course_name] || 0) + (r.credits || 0);
        }
      });

      if (!includeExclusive) {
        return baseMap[courseName] || 0;
      }

      // 排他グループを考慮する場合は、対象科目が属するグループだけを合算する
      const courseMetadata = opts.courseMetadata ?? [];
      const metadataByName: Record<string, CourseMetadata> = {};
      courseMetadata.forEach(m => { metadataByName[m.course] = m; });

      const targetMetadata = metadataByName[courseName];
      if (targetMetadata && Array.isArray(targetMetadata.exclusive_group) && targetMetadata.exclusive_group.length > 0) {
        const groupMembers = new Set<string>([courseName, ...targetMetadata.exclusive_group]);
        let sum = 0;
        groupMembers.forEach(name => {
          sum += baseMap[name] || 0;
        });
        return sum;
      }

      return baseMap[courseName] || 0;
    },
  };
});

const mapTranscriptToNewRecord = (record: TranscriptData): NewTranscriptData => ({
  course_name: record.course_name,
  year: record.year,
  status: record.status,
  credits: record.credits,
});

function buildTranscriptStatusMap(records: TranscriptData[]): Record<string, TranscriptStatus> {
  const latestRecordByCourse: Record<string, { status: TranscriptStatus; year: number }> = {};

  records.forEach(record => {
    const existing = latestRecordByCourse[record.course_name];
    if (!existing || record.year > existing.year || (record.year === existing.year && record.status === '修得' && existing.status !== '修得')) {
      latestRecordByCourse[record.course_name] = {
        status: record.status,
        year: record.year,
      };
    }
  });

  const map: Record<string, TranscriptStatus> = {};
  Object.entries(latestRecordByCourse).forEach(([courseName, data]) => {
    map[courseName] = data.status;
  });

  return map;
}