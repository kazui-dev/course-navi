import { type PendingConfirm, useConfirmStore } from "@/stores/useConfirmStore";

class ConfirmService {
  private resolverMap = new Map<number, (v: boolean) => void>();
  private idCounter = 0;

  confirm(opts: Omit<PendingConfirm, "id">): Promise<boolean> {
    const id = ++this.idCounter;
    const payload: PendingConfirm = { id, ...opts } as PendingConfirm;

    const promise = new Promise<boolean>((resolve) => {
      this.resolverMap.set(id, resolve);
      useConfirmStore.getState().setPending(payload);
    });

    return promise;
  }

  handleResponse(id: number, value: boolean) {
    const resolver = this.resolverMap.get(id);
    if (resolver) {
      try {
        resolver(value);
      } finally {
        this.resolverMap.delete(id);
      }
    }
    useConfirmStore.getState().clearPending();
  }
}

export const confirmService = new ConfirmService();
