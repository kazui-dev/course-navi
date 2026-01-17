import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { confirmService } from "@/lib/confirm";
import { toastService } from "@/lib/toast";

import {
  useSaveSlotsStore,
  useSettingsStore,
  useTimetableStore,
} from "@/stores";

/** このコンポーネントが受け取る Props の型 */
type SaveModalProps = {
  show: boolean;
  onHide: () => void;
};

function SaveModal({ show, onHide }: SaveModalProps) {
  const [tableName, setTableName] = useState("");
  const [memo, setMemo] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentYear = useSettingsStore((state) => state.currentYear);
  const timetable = useTimetableStore((state) => state.timetable);

  const saveTimetable = useSaveSlotsStore((state) => state.saveTimetable);
  const overwriteSaveSlot = useSaveSlotsStore(
    (state) => state.overwriteSaveSlot,
  );
  const deleteSaveSlot = useSaveSlotsStore((state) => state.deleteSaveSlot);
  const revertSlotToSnapshot = useSaveSlotsStore(
    (state) => state.revertSlotToSnapshot,
  );

  const handleSave = async () => {
    if (currentYear === null) {
      setSaveError("現在の年度が選択されていません。");
      return;
    }

    const trimmedName = tableName.trim();
    const trimmedMemo = memo.trim();

    const result = await saveTimetable(
      trimmedName,
      trimmedMemo,
      currentYear,
      timetable,
    );

    if (result.success) {
      const savedSlot = useSaveSlotsStore
        .getState()
        .allSaveSlots.find((slot) => slot.name === trimmedName);
      setTableName("");
      setMemo("");
      setSaveError(null);
      onHide();
      toastService.success({
        title: "保存成功",
        description: `${trimmedName} を保存しました。`,
        action: savedSlot
          ? {
              label: "取り消す",
              onClick: async () => {
                await deleteSaveSlot(savedSlot.id, savedSlot.year);
              },
            }
          : undefined,
      });
    } else if (result.error === "DUPLICATE_NAME") {
      setSaveError(null);
      const ok = await confirmService.confirm({
        title: "上書きの確認",
        message: `${trimmedName} は既に存在します。上書きしますか？`,
        okLabel: "上書き",
        cancelLabel: "キャンセル",
      });
      if (!ok) return;
      // ユーザーが OK したら上書き処理を呼ぶ
      const previousSnapshot =
        useSaveSlotsStore
          .getState()
          .allSaveSlots.find((slot) => slot.name === trimmedName) ?? null;
      const overwriteResult = await overwriteSaveSlot(
        trimmedName,
        trimmedMemo,
        currentYear!,
        timetable,
      );
      if (overwriteResult.success) {
        setTableName("");
        setMemo("");
        setSaveError(null);
        onHide();
        toastService.success({
          title: "上書き成功",
          description: `${trimmedName} を上書きしました。`,
          action: previousSnapshot
            ? {
                label: "取り消す",
                onClick: async () => {
                  await revertSlotToSnapshot(previousSnapshot);
                },
              }
            : undefined,
        });
      } else {
        setSaveError(overwriteResult.error || "上書きに失敗しました。");
      }
    } else {
      setSaveError(result.error || "不明なエラーが発生しました。");
    }
  };

  const handleHide = () => {
    setSaveError(null);
    onHide();
  };

  return (
    <>
      <Dialog open={show} onOpenChange={handleHide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>現在の時間割を保存</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            保存した時間割は「読み込み」ボタンから読み込めます
          </DialogDescription>
          <form
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="tableName">保存名を入力</Label>
              <Input
                id="tableName"
                type="text"
                placeholder="（必須）"
                value={tableName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setTableName(e.target.value);
                  if (saveError) setSaveError(null);
                }}
                autoFocus
                autoComplete="off"
                required
                aria-invalid={!!saveError}
              />
              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">メモを追加</Label>
              <Input
                id="memo"
                type="text"
                placeholder="（任意）"
                value={memo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMemo(e.target.value)
                }
                autoComplete="off"
              />
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleHide}>
                キャンセル
              </Button>
              <Button variant="default" type="submit">
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SaveModal;
