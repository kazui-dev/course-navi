import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { EditSaveSlotsModal } from "@/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirmService } from "@/lib/confirm";
import { toastService } from "@/lib/toast";
import {
  useCellStateStore,
  useSaveSlotsStore,
  useSettingsStore,
  useTimetableStore,
} from "@/stores";
import type { ParsedSaveSlot } from "@/types";

type LoadModalProps = {
  show: boolean;
  onHide: () => void;
};

function LoadModal({ show, onHide }: LoadModalProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<ParsedSaveSlot | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // --- ストアからの読み取り (型は自動推論される) ---
  const saveSlots = useSaveSlotsStore((state) => state.allSaveSlots); // ParsedSaveSlot[]
  const currentYear = useSettingsStore((state) => state.currentYear); // number | null

  const loadTimetableFromSave = useTimetableStore(
    (state) => state.loadTimetableFromSave,
  );
  const resetCellState = useCellStateStore((state) => state.resetCellState);
  const deleteSaveSlot = useSaveSlotsStore((state) => state.deleteSaveSlot);
  const updateSaveSlot = useSaveSlotsStore((state) => state.updateSaveSlot);
  const restoreDeletedSlot = useSaveSlotsStore(
    (state) => state.restoreDeletedSlot,
  );

  const onLoad = (SaveSlot: ParsedSaveSlot) => {
    if (currentYear === null) return;

    loadTimetableFromSave(SaveSlot.timetable, currentYear);
    resetCellState();
    onHide();
  };

  const onDelete = async (slot: ParsedSaveSlot) => {
    setShowEditModal(false);
    const ok = await confirmService.confirm({
      title: "削除の確認",
      message: `${slot.name} を削除しますか？`,
      okLabel: "削除",
      cancelLabel: "キャンセル",
    });
    if (!ok) return;
    if (currentYear === null) return;
    const result = await deleteSaveSlot(slot.id, currentYear);
    if (result.success) {
      toastService.success({
        title: "削除成功",
        description: `${slot.name} を削除しました。`,
        action: {
          label: "取り消す",
          onClick: async () => {
            await restoreDeletedSlot(slot);
          },
        },
      });
    }
  };

  const handleEditClick = (slot: ParsedSaveSlot) => {
    setSlotToEdit(slot);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSave = async (newName: string, newMemo: string) => {
    if (slotToEdit === null || currentYear === null) return;

    const result = await updateSaveSlot(
      slotToEdit.id,
      newName,
      newMemo,
      currentYear,
    );

    if (result.success) {
      setShowEditModal(false);
      setSlotToEdit(null);
      setEditError(null);
    } else {
      setEditError(result.error || "不明なエラーが発生しました。");
    }
  };

  const handleEditHide = () => {
    setShowEditModal(false);
    setSlotToEdit(null);
    setEditError(null);
  };

  const handleModalHide = () => {
    onHide();
    setShowEditModal(false);
    setSlotToEdit(null);
    setEditError(null);
  };

  return (
    <div>
      <Dialog open={show} onOpenChange={handleModalHide}>
        <DialogContent
          className="max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>保存した時間割を読み込む</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {saveSlots.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground text-center">
                保存済みの時間割はまだありません。
              </Card>
            ) : (
              saveSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-md hover:bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="truncate">{slot.name}</strong>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleEditClick(slot)}
                            className="text-muted-foreground p-1"
                            type="button"
                          >
                            <Pencil size={14} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>編集</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      メモ: {slot.memo || "なし"}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onLoad(slot)}
                    >
                      読み込む
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(slot)}
                        >
                          <X />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>削除</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditSaveSlotsModal
        show={showEditModal}
        onHide={handleEditHide}
        onSave={handleEditSave}
        currentSlot={slotToEdit}
        error={editError}
      />
    </div>
  );
}

export default LoadModal;
