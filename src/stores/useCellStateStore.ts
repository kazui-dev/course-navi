import { create } from 'zustand';
import type { CellData } from '@/types';

// ストアの状態: 現在クリックされている clickedCell と、それを2コマ単位に変換した表示用 currentCell
type CellState = {
  clickedCell: CellData;
  currentCell: CellData;
};

// ストアの操作: セル選択・リセット・外部からの直接設定
type CellActions = {
  // セルがクリック/選択されたときに呼ばれる。null で選択解除を表す
  handleCellSelect: (cell: CellData | null) => void;
  // 選択状態を初期化するユーティリティ
  resetCellState: () => void;
};

// ストア全体の型（状態 + 操作）
type CellStateStore = CellState & CellActions;


export const useCellStateStore = create<CellStateStore>((set) => ({
  // 初期状態: どのセルも選択されていない
  clickedCell: { day: null, period: null },
  currentCell: { day: null, period: null },

  // セル選択処理
  // - セルが null または period を持たない場合は選択解除として扱う
  // - それ以外では選択された時限から、表示用の2コマ単位に変換して currentCell に格納する
  handleCellSelect: (cell) => {
    set(() => {
      if (!cell || !cell.period) {
        // 選択解除
        return {
          clickedCell: { day: null, period: null },
          currentCell: { day: null, period: null },
        };
      }

      // 例えばクリックした時限が 3 の場合、表示用は 3, 4 のペアに揃える
      const clickedPeriod = cell.period[0];
      const startPeriod = Math.floor((clickedPeriod - 1) / 2) * 2 + 1;
      const dataPeriodPair = [startPeriod, startPeriod + 1];

      return {
        clickedCell: cell,
        currentCell: { day: cell.day, period: dataPeriodPair },
      };
    });
  },

  // 選択状態を初期化するユーティリティ
  resetCellState: () => {
    set({
      clickedCell: { day: null, period: null },
      currentCell: { day: null, period: null },
    });
  },
}));