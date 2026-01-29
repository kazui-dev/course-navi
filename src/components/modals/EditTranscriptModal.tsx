import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dbClient } from "@/services/dbClient";
import { useTranscriptsStore } from "@/stores";
import type { TranscriptData } from "@/types";

type EditTranscriptModalProps = {
  show: boolean;
  onHide: () => void;
  target: TranscriptData | null;
  onSave: (record: TranscriptData) => void;
  isSaving?: boolean;
  errorMessage?: string | null;
};

const STATUS_OPTIONS: TranscriptData["status"][] = ["履修", "修得"];

function EditTranscriptModal({
  show,
  onHide,
  target,
  onSave,
  isSaving = false,
  errorMessage = null,
}: EditTranscriptModalProps) {
  const [courseName, setCourseName] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<TranscriptData["status"]>("修得");
  const [credits, setCredits] = useState<number>(0);
  const [maxCredits, setMaxCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!show || !target) {
      setCourseName("");
      setCredits(0);
      setStatus("修得");
      setYear(new Date().getFullYear());
      return;
    }

    // 初期値をセット
    setCourseName(target.course_name);
    setYear(target.year);
    setStatus(target.status);
    setCredits(target.credits);

    let ignore = false;

    const computeMaxCredits = async () => {
      try {
        const store = useTranscriptsStore.getState();
        if (!store.isDataLoaded) {
          await store.loadTranscripts();
        }
        if (ignore) return;

        const metadataList = await dbClient.fetchCourseMetadata(target.year);
        if (ignore) return;

        const metadata = metadataList.find(
          (m) => m.course === target.course_name,
        );
        const explicitMax = metadata?.max_credits;
        let maxTotal: number | null;
        if (explicitMax === null || explicitMax === undefined) {
          maxTotal = null; // unlimited
        } else {
          maxTotal = explicitMax;
        }

        const acquiredSum = store.getAcquiredCredits(target.course_name, {
          upToYear: target.year,
          includeExclusiveGroup: true,
          includeSameYear: true,
          courseMetadata: metadataList,
        });

        // 自分自身（target）の単位数は「既修得」から除外して計算
        const otherAcquired =
          acquiredSum - (target.status === "修得" ? target.credits : 0);

        if (ignore) return;

        if (maxTotal === null) {
          setMaxCredits(null);
          setCredits(target.credits);
        } else {
          const remaining = Math.max(0, maxTotal - otherAcquired);
          setMaxCredits(remaining);
          // 現在の値が上限を超えている場合はクランプ
          setCredits(Math.min(target.credits, remaining));
        }
      } catch (err) {
        console.error("Failed to compute maxCredits for edit modal", err);
        if (!ignore) setMaxCredits(null);
      }
    };

    computeMaxCredits();

    return () => {
      ignore = true;
    };
  }, [show, target]);

  const isValid = courseName.trim().length > 0 && credits >= 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !isValid) return;
    onSave({
      id: target.id,
      course_name: courseName.trim(),
      year,
      status,
      credits,
    });
  };

  return (
    <Dialog open={show} onOpenChange={onHide}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>履修記録を編集</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">年度</Label>
              <p className="text-lg font-semibold mt-1">{year}年度</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">科目名</Label>
              <p className="text-lg font-semibold mt-1">{courseName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>履修状況</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as TranscriptData["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="履修状況を選択" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transcript-credits">単位数</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="transcript-credits"
                  type="number"
                  value={credits}
                  min={0}
                  step={1}
                  onChange={(e) => {
                    let v = Number(e.target.value);
                    if (!Number.isFinite(v) || Number.isNaN(v)) v = 0;
                    if (maxCredits != null) {
                      v = Math.max(0, Math.min(v, maxCredits));
                    }
                    setCredits(v);
                  }}
                  required
                  max={maxCredits ?? undefined}
                  disabled={maxCredits === 0}
                />
                <span className="text-xs text-muted-foreground">
                  {maxCredits === null ? "上限なし" : `残り ${maxCredits} 単位`}
                </span>
              </div>
            </div>
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" type="button" onClick={onHide}>
              キャンセル
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditTranscriptModal;
