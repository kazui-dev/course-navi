import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AddTranscriptModal, EditTranscriptModal } from "@/components";
import DropdownSelect from "@/components/common/DropdownSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { confirmService } from "@/lib/confirm";
import { toastService } from "@/lib/toast";
import { useSettingsStore, useTranscriptsStore } from "@/stores";
import type { TranscriptData } from "@/types";

export default function TranscriptsPage() {
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TranscriptData | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const updateTranscript = useTranscriptsStore(
    (state) => state.updateTranscript,
  );
  const deleteTranscript = useTranscriptsStore(
    (state) => state.deleteTranscript,
  );
  const restoreTranscript = useTranscriptsStore(
    (state) => state.restoreTranscript,
  );

  const transcripts = useTranscriptsStore((state) => state.transcripts);
  const loadTranscripts = useTranscriptsStore((state) => state.loadTranscripts);

  useEffect(() => {
    loadTranscripts();
  }, [loadTranscripts]);

  const handleEditClick = (item: TranscriptData) => {
    setEditTarget(item);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSave = async (record: TranscriptData) => {
    setIsSavingEdit(true);
    const result = await updateTranscript(record);
    setIsSavingEdit(false);
    if (result.success) {
      setShowEditModal(false);
      setEditTarget(null);
      setEditError(null);
    } else {
      setEditError(result.error || "更新に失敗しました。");
    }
  };

  const handleDeleteClick = async (item: TranscriptData) => {
    const ok = await confirmService.confirm({
      title: "削除の確認",
      message: `${item.year}年度「${item.course_name}」を削除しますか？`,
      okLabel: "削除",
      cancelLabel: "キャンセル",
    });
    if (!ok) return;
    const result = await deleteTranscript(item.id);
    if (result.success) {
      toastService.success({
        title: "削除成功",
        description: `${item.year}年度「${item.course_name}」を削除しました。`,
        action: {
          label: "取り消す",
          onClick: async () => {
            await restoreTranscript(item);
          },
        },
      });
    } else {
      toastService.error({
        title: "削除失敗",
        description: `削除に失敗しました。再度お試しください。 (${result.error ?? "エラー"})`,
      });
    }
  };

  const [filterText, setFilterText] = useState("");
  const courseAbbrMap = useTranscriptsStore((state) => state.courseAbbrMap);
  const availableYearsForTranscripts = useSettingsStore(
    (state) => state.availableYearsForTranscripts,
  );

  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const keyword = filterText.trim().toLowerCase();
  const filteredTranscripts = transcripts.filter((item) => {
    if (keyword) {
      const courseNameMatch = item.course_name.toLowerCase().includes(keyword);
      const abbr = courseAbbrMap[item.course_name]?.toLowerCase() ?? "";
      const abbrMatch = abbr.includes(keyword);
      if (!courseNameMatch && !abbrMatch) return false;
    }

    if (yearFilter !== null) {
      if (item.year !== Number(yearFilter)) return false;
    }

    if (statusFilter !== null) {
      if (item.status !== statusFilter) return false;
    }

    return true;
  });

  const acquiredCredits = filteredTranscripts.reduce(
    (sum, r) => (r.status === "修得" ? sum + (r.credits ?? 0) : sum),
    0,
  );

  return (
    <div className="px-6 py-4 h-full flex flex-col overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold">履修記録一覧</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between mb-4 flex-shrink-0">
        <Input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="科目名 / 略称で絞り込み"
          className="w-72"
        />
        <Button onClick={() => setShowModal(true)}>
          <Plus /> 履修記録を追加
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden flex-1 flex flex-col">
        {/* Header (Sticky) */}
        <div className="flex-shrink-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">
                  <div className="flex items-center justify-center">
                    <div className="relative w-full flex items-center justify-center">
                      <DropdownSelect
                        items={[
                          "全年度",
                          ...(availableYearsForTranscripts || []).map(String),
                        ]}
                        currentItem={yearFilter ?? "全年度"}
                        onItemSelect={(v) =>
                          setYearFilter(v === "全年度" ? null : v)
                        }
                        renderItem={(v) =>
                          v === "全年度" ? "全年度" : `${v}年度`
                        }
                        placeholder="全年度"
                        allowReselect={true}
                        triggerClassName="absolute left-1/2 -translate-x-1/2 h-9 text-sm w-28"
                      />
                    </div>
                  </div>
                </TableHead>
                <TableHead className="w-36 text-left">科目名</TableHead>
                <TableHead className="w-24 text-center">
                  <div className="flex items-center justify-center">
                    <DropdownSelect
                      items={["履修 / 修得", "履修", "修得"]}
                      currentItem={statusFilter ?? "履修 / 修得"}
                      onItemSelect={(v) =>
                        setStatusFilter(v === "履修 / 修得" ? null : v)
                      }
                      renderItem={(v) => v}
                      placeholder="履修 / 修得"
                      allowReselect={true}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-20 text-center">
                  単位数（修得: {acquiredCredits}）
                </TableHead>
                <TableHead className="w-40 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableBody>
              {filteredTranscripts.length > 0 ? (
                filteredTranscripts.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50">
                    <TableCell className="w-16 text-center">
                      {item.year}
                    </TableCell>
                    <TableCell className="w-36 text-left">
                      {item.course_name}
                    </TableCell>
                    <TableCell className="w-24 text-center">
                      {item.status}
                    </TableCell>
                    <TableCell className="w-20 text-center">
                      {item.credits}
                    </TableCell>
                    <TableCell className="w-40 text-center">
                      <div className="flex gap-2 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(item)}
                        >
                          編集
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(item)}
                        >
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="w-16 text-center" />
                  <TableCell className="w-36 text-left text-muted-foreground py-8">
                    {transcripts.length === 0
                      ? "今までに履修 / 修得した科目を追加してください。"
                      : "該当する履修記録がありません。"}
                  </TableCell>
                  <TableCell className="w-24 text-center" />
                  <TableCell className="w-20 text-center" />
                  <TableCell className="w-40 text-center" />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AddTranscriptModal show={showModal} onHide={() => setShowModal(false)} />

      <EditTranscriptModal
        show={showEditModal}
        onHide={() => {
          setShowEditModal(false);
          setEditTarget(null);
          setEditError(null);
        }}
        target={editTarget}
        onSave={handleEditSave}
        isSaving={isSavingEdit}
        errorMessage={editError}
      />
    </div>
  );
}
