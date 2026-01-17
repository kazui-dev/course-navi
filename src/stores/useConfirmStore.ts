import { create } from "zustand";

export type PendingConfirm = {
  id: number;
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
};

type ConfirmStore = {
  pending: PendingConfirm | null;
  setPending: (p: PendingConfirm) => void;
  clearPending: () => void;
};

export const useConfirmStore = create<ConfirmStore>((set) => ({
  pending: null,
  setPending: (p: PendingConfirm) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
}));
