import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmService } from "@/lib/confirm";
import { useConfirmStore } from "@/stores/useConfirmStore";

/** このコンポーネントが受け取る Props の型 */
export type ConfirmModalProps = {
  title?: string;
  message: string;
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
};

export function ConfirmModalRoot() {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const pending = useConfirmStore((s) => s.pending);
  if (!pending) return null;

  const handleHide = () => {
    useConfirmStore.getState().clearPending();
  };

  const handleConfirm = () => {
    confirmService.handleResponse(pending.id, true);
  };

  return (
    <Dialog open={true} onOpenChange={handleHide}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirmButtonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{pending.title ?? "確認"}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-base text-foreground whitespace-pre-line">
          {pending.message}
        </DialogDescription>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleHide} type="button">
            キャンセル
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ConfirmModalView is intentionally not exported as a public API.
// Use `confirmService.confirm(...)` and `ConfirmModalRoot` instead.
