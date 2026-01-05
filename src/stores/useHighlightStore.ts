import { create } from 'zustand';
import type { SearchResult, CourseData } from '@/types';

// ハイライト用ストア
// - previewHighlight: courseList ホバー時のプレビュー用の科目配列
// - searchHighlight: 検索結果をハイライト表示するための配列
type HighlightState = {
  previewHighlight: CourseData[] | null;
  searchHighlight: SearchResult[] | null;
};

// 操作: ハイライトの設定/解除
type HighlightActions = {
  setPreviewHighlight: (highlightData: CourseData[] | null) => void;
  setSearchHighlight: (highlightData: SearchResult[] | null) => void;
};

type HighlightStore = HighlightState & HighlightActions;

// ストア本体: シンプルに state を set するだけの実装
export const useHighlightStore = create<HighlightStore>((set) => ({
  previewHighlight: null,
  searchHighlight: null,

  setPreviewHighlight: (highlightData) => {
    // プレビュー用のハイライトを設定または解除
    set({ previewHighlight: highlightData });
  },

  setSearchHighlight: (highlightData) => {
    // 検索結果のハイライトを設定または解除
    set({ searchHighlight: highlightData });
  },
}));