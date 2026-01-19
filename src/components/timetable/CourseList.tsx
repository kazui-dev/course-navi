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
import type { CellData, CourseData } from "@/types";
import { formatPrereqConfirmation, getCellKey } from "@/utils";

const days = ["月", "火", "水", "木", "金"];

interface SubjectCourseGroup {
  subject: string;
  entries: CourseData[][];
}

const getCourseInfo = (data: CourseData[]): string => {
  if (!data || data.length === 0) return "";
  const [{ credits, period }] = data;
  const singlePeriodLabel = period?.[0] ? `${period[0]}限` : "";
  const dayLabel = () => data.map((d) => days[d.day]).join(", ");

  if (credits <= 1) {
    return data.length > 1
      ? `(${dayLabel()} ${singlePeriodLabel})`
      : `(${singlePeriodLabel})`;
  }

  if (credits >= 4) {
    return `(${dayLabel()})`;
  }

  return "";
};

type CourseListProps = {
  register: (
    currentCell: CellData | null,
    data: CourseData[],
    force?: boolean,
  ) => Promise<
    { success: boolean; blocked?: true; message?: string } | undefined
  >;
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
  const currentCell = useCellStateStore((state) => state.currentCell);
  const { day, period } = currentCell;

  const setPreviewHighlight = useHighlightStore(
    (state) => state.setPreviewHighlight,
  );
  const searchHighlight = useHighlightStore((state) => state.searchHighlight);
  // 検索結果のcourse_name一覧をSet化
  const highlightedNames = searchHighlight
    ? new Set(searchHighlight.map((r) => r.course_name))
    : new Set();

  const isCourseListLoading = useTimetableStore(
    (state) => state.isCourseListLoading,
  );

  const [hideAcquired, setHideAcquired] = useState(true);
  const [filterPrereqs, setFilterPrereqs] = useState(true);
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

  // 前提条件フィルタは settingsStore により年度切替時に事前計算される
  // ここでは store の値を参照して同期的にフィルタを行う
  useEffect(() => {
    if (!isTranscriptsLoaded) {
      loadTranscripts().catch((err) => console.error(err));
    }
  }, [isTranscriptsLoaded, loadTranscripts]);
  useEffect(() => {
    onClearDetail?.();
  }, [onClearDetail]);

  const getVisibleCoursesForCell = useTimetableStore(
    (state) => state.getVisibleCoursesForCell,
  );

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

  function ControlsComponent(props: {
    filterPrereqs: boolean;
    setFilterPrereqs: (v: boolean) => void;
    hideAcquired: boolean;
    setHideAcquired: (v: boolean) => void;
  }) {
    const { filterPrereqs, setFilterPrereqs, hideAcquired, setHideAcquired } =
      props;
    const id = useId();
    const filterId = `${id}-filterPrereqs`;
    const hideId = `${id}-hideAcquired`;
    return (
      <div className="my-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={filterId}
              checked={filterPrereqs}
              onCheckedChange={(v) => setFilterPrereqs(Boolean(v))}
            />
            <Label htmlFor={filterId}>前提条件を満たす</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={hideId}
              checked={hideAcquired}
              onCheckedChange={(v) => setHideAcquired(Boolean(v))}
            />
            <Label htmlFor={hideId}>修得済み科目を非表示</Label>
          </div>
        </div>
      </div>
    );
  }

  const handleRegisterFromList = async (data: CourseData[]) => {
    const result = await register(currentCell, data);
    if (
      result &&
      typeof result === "object" &&
      "blocked" in result &&
      (result as { blocked?: true }).blocked
    ) { 
      const courseName = data[0]?.course ?? "";
      const resWithConfirm = result as unknown as {
        confirmType?: string;
        message?: string;
      };
      if (
        resWithConfirm.confirmType === "maxCredits" &&
        typeof resWithConfirm.message === "string"
      ) {
        const parts = resWithConfirm.message.split("|");
        const acquired = Number(parts[0]) || 0;
        const max = Number(parts[1]) || 0;
        const remaining = Math.max(0, max - acquired);
        const title = `上限単位数確認: ${courseName}`;
        const message = `この科目を既に${acquired}単位修得しているので、あと${remaining}単位しか修得できません。\n登録しますか？`;
        const ok = await confirmService.confirm({
          title,
          message,
          okLabel: "登録",
          cancelLabel: "キャンセル",
        });
        if (!ok) return;
        await register(currentCell, data, true);
        return;
      }

      const raw =
        "message" in result
          ? (result as { message?: string }).message
          : undefined;
      let title: string | undefined;
      let message: string = "";
      try {
        const res = await formatPrereqConfirmation(
          courseName,
          raw,
          currentYear ?? undefined,
        );
        title = res.title;
        message = res.message;
      } catch {
        const res = await formatPrereqConfirmation(courseName, raw);
        title = res.title;
        message = res.message;
      }
      const ok = await confirmService.confirm({
        title,
        message,
        okLabel: "登録",
        cancelLabel: "キャンセル",
      });
      if (!ok) return;
      await register(currentCell, data, true);
    }
  };

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
  if (isCourseListLoading) {
    return (
      <div>
        <div className="mb-2">
          <div className="flex justify-between items-center">
            <h5 className="text-xl font-semibold">{`${days[day]}曜${period.join(",")}限:`}</h5>
            <UnregisterButton unregister={unregister} />
          </div>
          <ControlsComponent
            filterPrereqs={filterPrereqs}
            setFilterPrereqs={(v) => setFilterPrereqs(v)}
            hideAcquired={hideAcquired}
            setHideAcquired={(v) => setHideAcquired(v)}
          />
        </div>
        <Card className="p-3 text-center text-muted-foreground">
          授業データを読み込んでいます…
        </Card>
      </div>
    );
  }

  if (courseList.length === 0) {
    return (
      <div>
        <div className="mb-2">
          <div className="flex justify-between items-center">
            <h5 className="text-xl font-semibold">{`${days[day]}曜${period.join(",")}限:`}</h5>
            <UnregisterButton unregister={unregister} />
          </div>
          <ControlsComponent
            filterPrereqs={filterPrereqs}
            setFilterPrereqs={(v) => setFilterPrereqs(v)}
            hideAcquired={hideAcquired}
            setHideAcquired={(v) => setHideAcquired(v)}
          />
        </div>
        <Card className="p-3 text-center text-muted-foreground">
          開講授業がありません。
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <div className="flex justify-between items-center">
          <h5 className="text-xl font-semibold">{`${days[day]}曜${period.join(",")}限:`}</h5>
          <UnregisterButton unregister={unregister} />
        </div>
        <ControlsComponent
          filterPrereqs={filterPrereqs}
          setFilterPrereqs={(v) => setFilterPrereqs(v)}
          hideAcquired={hideAcquired}
          setHideAcquired={(v) => setHideAcquired(v)}
        />
      </div>
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
