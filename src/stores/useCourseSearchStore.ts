import { create } from 'zustand';
import { dbClient } from '@/services/dbClient';
import type { SearchResult } from '@/types';
import { useHighlightStore } from './useHighlightStore';

// オートフィルリクエストの形
interface AutoFillRequest {
  value: string;
  id: number;
}

// 科目検索ストアの状態と操作
interface CourseSearchState {
  autoFillRequest: AutoFillRequest | null; // 自動入力要求（UI -> ストア）
  isSearching: boolean; // 検索中フラグ
  lastQueryKey: string | null; // 最後に実行したクエリの識別子
  requestAutoFill: (value: string) => void; // オートフィルを要求する
  clearAutoFillRequest: () => void; // オートフィル要求をクリア
  runSearch: (name: string, year: number | null) => Promise<void>; // 実際に DB 検索を行う
  clearSearchResults: () => void; // 検索結果をクリア
}

// ローカルのリクエストカウンタ（オートフィルの重複防止に利用）
let requestCounter = 0;

// クエリのキーを組み立て（キャッシュや重複判定に有用）
const buildQueryKey = (name: string, year: number | null) => `${year ?? 'none'}::${name.trim().toLowerCase()}`;

// 検索結果をハイライト用ストアに渡すユーティリティ
const setHighlight = (results: SearchResult[] | null) => {
  useHighlightStore.getState().setSearchHighlight(results && results.length > 0 ? results : null);
};

// ストア本体
export const useCourseSearchStore = create<CourseSearchState>((set, get) => ({
  autoFillRequest: null,
  isSearching: false,
  lastQueryKey: null,

  // オートフィル要求を登録（UI から呼ばれる）
  // 例: courseDetail からの「他の開講時間」クリック時 
  requestAutoFill: (value: string) => {
    requestCounter += 1;
    set({ autoFillRequest: { value, id: requestCounter } });
  },

  clearAutoFillRequest: () => set({ autoFillRequest: null }),

  // 名前と年度で DB を検索し、結果をハイライトに設定する
  // - 年度が null の場合は検索を行わない
  runSearch: async (name, year) => {
    const query = name.trim();
    if (!query || year === null) {
      setHighlight(null);
      set({ isSearching: false, lastQueryKey: null });
      return;
    }

    const queryKey = buildQueryKey(query, year);
    set({ isSearching: true, lastQueryKey: queryKey });
    try {
      const results = await dbClient.searchCourseByName(query, year);
      // 応答が現在の lastQueryKey と一致する場合にのみ結果を適用する
      if (get().lastQueryKey === queryKey) {
        setHighlight(results ?? null);
      }
    } catch (error) {
      console.error(error);
      if (get().lastQueryKey === queryKey) {
        setHighlight(null);
      }
    } finally {
      // isSearching フラグだけクリアし、lastQueryKey は上書きされないようにする
      set({ isSearching: false });
    }
  },

  clearSearchResults: () => {
    setHighlight(null);
    set({ lastQueryKey: null });
  },
}));
