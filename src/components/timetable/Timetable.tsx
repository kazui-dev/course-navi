import { useState } from "react";
import {
  ClassSelect,
  CourseSearch,
  TimetableCell,
  YearSelect,
} from "@/components";
import VerificationModal from "@/components/modals/VerificationModal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirmService } from "@/lib/confirm";
import { toastService } from "@/lib/toast";
import {
  useCellStateStore,
  useSettingsStore,
  useTimetableStore,
} from "@/stores";
import type { TimetableCellContent } from "@/types";

const days = ["月", "火", "水", "木", "金"];

const periodTimes: Record<number, { start: string; end: string }> = {
  1: { start: "08:40", end: "09:30" },
  2: { start: "09:30", end: "10:20" },
  3: { start: "10:40", end: "11:30" },
  4: { start: "11:30", end: "12:20" },
  5: { start: "13:10", end: "14:00" },
  6: { start: "14:00", end: "14:50" },
  7: { start: "15:10", end: "16:00" },
  8: { start: "16:00", end: "16:50" },
  9: { start: "17:20", end: "18:10" },
  10: { start: "18:10", end: "19:00" },
  11: { start: "19:30", end: "20:20" },
  12: { start: "20:20", end: "21:10" },
};

type TimetableProps = {
  onYearChange: (year: string | number) => void;
  onClassChange: (className: string | null) => void;
  onClearTimetable: () => void;
};

export default function Timetable({
  onYearChange,
  onClassChange,
  onClearTimetable,
}: TimetableProps) {
  const currentYear = useSettingsStore((state) => state.currentYear);
  const allCourses = useSettingsStore((state) => state.allCourses);
  const availableYearsFromSectionTimes = useSettingsStore(
    (state) => state.availableYearsFromSectionTimes,
  );
  const currentClass = useSettingsStore((state) => state.currentClass);
  const availableClasses = useSettingsStore((state) => state.availableClasses);

  const timetable = useTimetableStore((state) => state.timetable);
  const totalCredits = useTimetableStore((state) => state.totalCredits);
  const restoreTimetableSnapshot = useTimetableStore(
    (state) => state.restoreTimetableSnapshot,
  );

  const selectedCell = useCellStateStore((state) => state.clickedCell);
  const handleCellSelect = useCellStateStore((state) => state.handleCellSelect);

  const handleConfirmClear = () => {
    const snapshot = structuredClone(timetable);
    onClearTimetable();
    toastService.success({
      title: "消去成功",
      description: "時間割の内容を消去しました。",
      action: {
        label: "取り消す",
        onClick: () => {
          restoreTimetableSnapshot(snapshot);
        },
      },
    });
  };

  const [showVerificationModal, setShowVerificationModal] = useState(false);

  return (
    <div className="timetable">
      <div className="flex gap-2 items-center mb-4">
        <div className="flex gap-2 items-center">
          <YearSelect
            currentYear={currentYear}
            availableYears={availableYearsFromSectionTimes}
            onYearChange={onYearChange}
          />
          <ClassSelect
            currentClass={currentClass}
            availableClasses={availableClasses}
            onClassChange={onClassChange}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const applyHomeroom =
                      useTimetableStore.getState().applyHomeroomCourses;
                    await applyHomeroom(currentClass);
                  } catch (err) {
                    console.error("Failed to apply homeroom courses", err);
                  }
                }}
              >
                HR
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>時間割にHRを登録</p>
            </TooltipContent>
          </Tooltip>
          <h5 className="text-sm font-medium mb-0">単位数: {totalCredits}</h5>
        </div>
        <div className="ml-auto w-60">
          <CourseSearch allCourses={allCourses} currentYear={currentYear} />
        </div>
      </div>
      <div className="border rounded-lg">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center w-16 h-10"></TableHead>
              {days.map((day) => (
                <TableHead key={day} className="text-center h-10">
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {timetable.map((row, rowIdx) => {
              const period = rowIdx + 1;
              return (
                <TableRow key={period}>
                  <TableCell className="text-center font-semibold bg-muted w-16 h-12 cursor-default">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block w-full">{period}限</span>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>
                          {periodTimes[period]?.start ?? "-"} -{" "}
                          {periodTimes[period]?.end ?? "-"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {row.map((cell: TimetableCellContent, day: number) => {
                    const isEvenRow = rowIdx % 2 === 0;
                    const nextCell = isEvenRow
                      ? timetable[rowIdx + 1][day]
                      : "";
                    const prevCell = !isEvenRow
                      ? timetable[rowIdx - 1][day]
                      : "";

                    return (
                      <TimetableCell
                        key={`${period}-${days[day]}`}
                        day={day}
                        period={period}
                        cell={cell}
                        selectedCell={selectedCell}
                        isEvenRow={isEvenRow}
                        nextCell={nextCell}
                        prevCell={prevCell}
                        handleCellSelect={handleCellSelect}
                      />
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            const ok = await confirmService.confirm({
              title: "消去の確認",
              message: "時間割の内容を消去しますか？",
              okLabel: "消去",
              cancelLabel: "キャンセル",
            });
            if (ok) handleConfirmClear();
          }}
        >
          全消去
        </Button>
        <Button
          size="sm"
          variant="default"
          className="float-right"
          onClick={() => setShowVerificationModal(true)}
        >
          検証
        </Button>
      </div>
      <VerificationModal
        show={showVerificationModal}
        onHide={() => setShowVerificationModal(false)}
      />
    </div>
  );
}
