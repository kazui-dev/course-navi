import { ArrowBigRight, Info } from "lucide-react";
import { Fragment, useEffect, useId, useState } from "react";
import { UnregisterButton } from "@/components";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirmService } from "@/lib/confirm";
import {
  useCellStateStore,
  useHighlightStore,
  useSettingsStore,
  useTimetableStore,
  useTranscriptsStore,
} from "@/stores";
import type { CellData, CourseData, RegisterResult } from "@/types";
import { formatPrereqConfirmation, getCellKey, getCourseInfo } from "@/utils";

const days = ["月", "火", "水", "木", "金"];

interface SubjectCourseGroup {
  subject: string;
  entries: CourseData[][];
}

// 共通ヘッダーコンポーネント
type CourseListHeaderProps = {
  day: number | null;
  period: number[] | null;
  onUnregister: () => void;
  filterPrereqs: boolean;
  setFilterPrereqs: (v: boolean) => void;
  hideAcquired: boolean;
  setHideAcquired: (v: boolean) => void;
};

function CourseListHeader({
  day,
  period,
  onUnregister,
  filterPrereqs,
  setFilterPrereqs,
  hideAcquired,
  setHideAcquired,
}: CourseListHeaderProps) {
  const checkboxId = useId();

  if (day === null || period === null) return null;

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center">
        <h5 className="text-xl font-semibold">{`${days[day]}曜${period.join(",")}限:`}</h5>
        <UnregisterButton onClick={onUnregister} visible={true} />
      </div>
      <div className="my-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${checkboxId}-prereqs`}
              checked={filterPrereqs}
              onCheckedChange={(v) => setFilterPrereqs(Boolean(v))}
            />
            <Label htmlFor={`${checkboxId}-prereqs`}>前提条件を満たす</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${checkboxId}-acquired`}
              checked={hideAcquired}
              onCheckedChange={(v) => setHideAcquired(Boolean(v))}
            />
            <Label htmlFor={`${checkboxId}-acquired`}>
              修得済み科目を非表示
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

type CourseListProps = {
  register: (
    currentCell: CellData | null,
    data: CourseData[],
    force?: boolean,
  ) => Promise<RegisterResult>;
  unregister: (cell: CellData) => void;
  currentYear: number | null;
  onShowDetail?: (courseCode: string) => void;
  onClearDetail?: () => void;
  activeDetailCode?: string | null;
};

function CourseList({
  register,
  unregister,
  currentYear,
  onShowDetail,
  onClearDetail,
  activeDetailCode = null,
}: CourseListProps) {
  // Store Selectors
  const currentCell = useCellStateStore((state) => state.currentCell);
  const { day, period } = currentCell;
  const setPreviewHighlight = useHighlightStore(
    (state) => state.setPreviewHighlight,
  );
  const searchHighlight = useHighlightStore((state) => state.searchHighlight);
  const isCourseListLoading = useTimetableStore(
    (state) => state.isCourseListLoading,
  );
  const getVisibleCoursesForCell = useTimetableStore(
    (state) => state.getVisibleCoursesForCell,
  );
  const allowedCoursesFromStore = useSettingsStore(
    (state) => state.currentAllowedCourses,
  );
  const isAllowedComputedFromStore = useSettingsStore(
    (state) => state.isAllowedComputed,
  );
  const isTranscriptsLoaded = useTranscriptsStore(
    (state) => state.isDataLoaded,
  );
  const loadTranscripts = useTranscriptsStore((state) => state.loadTranscripts);

  // Local State
  const [hideAcquired, setHideAcquired] = useState(true);
  const [filterPrereqs, setFilterPrereqs] = useState(true);

  // Computed
  const highlightedNames = searchHighlight
    ? new Set(searchHighlight.map((r) => r.course_name))
    : new Set();

  useEffect(() => {
    if (!isTranscriptsLoaded) {
      loadTranscripts().catch((err) => console.error(err));
    }
  }, [isTranscriptsLoaded, loadTranscripts]);

  useEffect(() => {
    onClearDetail?.();
  }, [onClearDetail]);

  const courseList: SubjectCourseGroup[] = (() => {
    if (day === null || !period || period.length === 0) return [];
    const cellKey = getCellKey(day, period[0]);
    return getVisibleCoursesForCell(cellKey, {
      hideAcquired,
      filterPrereqs,
      allowedCourses: allowedCoursesFromStore ?? null,
      isAllowedComputed: isAllowedComputedFromStore,
      currentYear,
    });
  })();

  const handleRegisterFromList = async (data: CourseData[]) => {
    const result = await register(currentCell, data);

    // 成功またはundefinedの場合は何もしない
    if (!result || result.success) return;

    // ブロックされた場合の処理
    const courseName = data[0]?.course ?? "";
    const { confirmType, message: rawMessage } = result;

    // 1. 最大単位数オーバーの確認
    if (confirmType === "maxCredits" && rawMessage) {
      const [acquiredStr, maxStr] = rawMessage.split("|");
      const acquired = Number(acquiredStr) || 0;
      const max = Number(maxStr) || 0;
      const remaining = Math.max(0, max - acquired);

      const ok = await confirmService.confirm({
        title: `上限単位数確認: ${courseName}`,
        message: `この科目を既に${acquired}単位修得しているので、あと${remaining}単位しか修得できません。\n登録しますか？`,
        okLabel: "登録",
        cancelLabel: "キャンセル",
      });

      if (ok) {
        await register(currentCell, data, true);
      }
      return;
    }

    // 2. 前提条件違反などの確認 (Prerequisite)
    let title: string | undefined;
    let message: string = "";

    try {
      const res = await formatPrereqConfirmation(
        courseName,
        rawMessage,
        currentYear ?? undefined,
      );
      title = res.title;
      message = res.message;
    } catch {
      const res = await formatPrereqConfirmation(courseName, rawMessage);
      title = res.title;
      message = res.message;
    }

    const ok = await confirmService.confirm({
      title,
      message,
      okLabel: "登録",
      cancelLabel: "キャンセル",
    });

    if (ok) {
      await register(currentCell, data, true);
    }
  };

  // --- Render ---

  if (day === null || period === null) {
    return (
      <>
        <h5 className="text-xl font-semibold mb-2">開講授業一覧</h5>
        <Card className="p-3 text-center text-muted-foreground">
          時間割をクリックすると
          <br />
          その時間の授業が表示されます。
        </Card>
      </>
    );
  }

  // 共通ヘッダー
  const header = (
    <CourseListHeader
      day={day}
      period={period}
      onUnregister={() => unregister(currentCell)}
      filterPrereqs={filterPrereqs}
      setFilterPrereqs={setFilterPrereqs}
      hideAcquired={hideAcquired}
      setHideAcquired={setHideAcquired}
    />
  );

  if (isCourseListLoading) {
    return (
      <div>
        {header}
        <Card className="p-3 text-center text-muted-foreground">
          授業データを読み込んでいます…
        </Card>
      </div>
    );
  }

  if (courseList.length === 0) {
    return (
      <div>
        {header}
        <Card className="p-3 text-center text-muted-foreground">
          開講授業がありません。
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div style={{ maxHeight: "calc(100vh - 180px)", overflowY: "auto" }}>
        <Table className="align-middle">
          <TableBody>
            {courseList.map(({ subject, entries }) => (
              <Fragment key={subject}>
                {entries.map((data, index) => {
                  if (data.length === 0) return null;
                  const courseData = data[0];
                  const displayName = `${courseData.abbr} ${courseData.section}`;
                  const info = getCourseInfo(data);
                  const isActive = activeDetailCode === courseData.code;
                  const DetailIcon = isActive ? ArrowBigRight : Info;
                  const tooltipLabel = isActive ? "表示中" : "詳細";
                  const highlightClass = highlightedNames.has(courseData.course)
                    ? "bg-yellow-100"
                    : "";

                  return (
                    <TableRow key={courseData.code}>
                      {index === 0 && (
                        <TableCell
                          className="font-medium py-2"
                          style={{ width: "85px" }}
                          rowSpan={entries.length}
                        >
                          {subject}
                        </TableCell>
                      )}
                      <TableCell
                        className={`py-2 cursor-pointer hover:bg-muted/50 ${highlightClass}`}
                        onClick={() => handleRegisterFromList(data)}
                        onMouseOver={() => setPreviewHighlight(data)}
                        onMouseOut={() => setPreviewHighlight(null)}
                      >
                        <div>
                          {displayName}
                          <small className="ml-1 text-muted-foreground">
                            {info}
                          </small>
                        </div>
                      </TableCell>
                      {onShowDetail && (
                        <TableCell className="py-1 w-10">
                          <div className="h-full flex items-center justify-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-muted-foreground transition hover:text-foreground"
                                  onClick={() => onShowDetail(courseData.code)}
                                  aria-label={tooltipLabel}
                                >
                                  <DetailIcon className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{tooltipLabel}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      )}
                      {!onShowDetail && <TableCell className="py-2 w-10" />}
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default CourseList;
