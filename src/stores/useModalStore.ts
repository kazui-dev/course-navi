import { create } from "zustand";

// モーダル表示状態を管理するシンプルなストア
type ModalState = {
  isSaveModalVisible: boolean;
  isLoadModalVisible: boolean;
};

// モーダル表示の操作群
type ModalActions = {
  showSaveModal: () => void;
  hideSaveModal: () => void;
  showLoadModal: () => void;
  hideLoadModal: () => void;
};

type ModalStore = ModalState & ModalActions;

// 実装: 単純に true/false を set するだけ
export const useModalStore = create<ModalStore>((set) => ({
  isSaveModalVisible: false,
  isLoadModalVisible: false,

  showSaveModal: () => set({ isSaveModalVisible: true }),
  hideSaveModal: () => set({ isSaveModalVisible: false }),

  showLoadModal: () => set({ isLoadModalVisible: true }),
  hideLoadModal: () => set({ isLoadModalVisible: false }),
}));
