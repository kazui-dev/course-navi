import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { dbClient } from "@/services/dbClient";
import { useSettingsStore, useTranscriptsStore } from "@/stores";
import type { CourseDetailData } from "@/types";
import { formatRuleLogic } from "@/utils/prerequisiteUtils";

type CourseDetailProps = {
  detail: CourseDetailData | null;
  isLoading: boolean;
  onFillCourseSearch: (courseName: string) => void;
};

function PrerequisiteList({
  courseName,
  fallback,
}: {
  courseName: string;
  fallback?: string | null;
}) {
  const currentYear = useSettingsStore((state) => state.currentYear);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!courseName || !currentYear) {
        if (mounted) setText(fallback ?? null);
        return;
      }
      try {
        const [rules, profile] = await Promise.all([
          dbClient.fetchPrerequisiteRules(courseName, currentYear),
          dbClient.fetchUserProfile(currentYear),
        ]);

        const applicable = rules.filter((rule) => {
          const departmentMatch =
            !rule.target_department ||
            rule.target_department.includes(profile?.department ?? "");
          const userGraduating = profile?.is_graduating_year ?? 0;
          const graduatingMatch =
            rule.if_graduating === null ||
            rule.if_graduating === userGraduating;
          return departmentMatch && graduatingMatch;
        });

        const parts: string[] = [];
        for (const r of applicable) {
          try {
            const parsed = JSON.parse(r.rule_logic_json);
            const desc = formatRuleLogic(parsed).trim();
            if (desc) parts.push(desc);
          } catch {
            // なにもしない
          }
        }

        if (!mounted) return;
        if (parts.length === 0) {
          setText(fallback ?? null);
        } else {
          setText(parts.join("\n\n"));
        }
      } catch {
        if (mounted) setText(fallback ?? null);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [courseName, currentYear, fallback]);

  if (!text) return <span className="text-muted-foreground">なし</span>;
  return <div className="whitespace-pre-line text-sm">{text}</div>;
}

export default function CourseDetail({
  detail,
  isLoading,
  onFillCourseSearch,
}: CourseDetailProps) {
  const currentYear = useSettingsStore((state) => state.currentYear);
  const [enrolledCredits, setEnrolledCredits] = useState<number | null>(null);
  const [acquiredCredits, setAcquiredCredits] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!detail) {
        if (mounted) {
          setEnrolledCredits(null);
          setAcquiredCredits(null);
        }
        return;
      }

      try {
        const upToYear =
          typeof currentYear === "number" ? currentYear : undefined;

        const transcriptsStore = useTranscriptsStore.getState();
        if (!transcriptsStore.isDataLoaded) {
          await transcriptsStore.loadTranscripts();
        }

        const courseMetadata = await dbClient.fetchCourseMetadata(
          upToYear ?? new Date().getFullYear(),
        );
        const acquired = useTranscriptsStore
          .getState()
          .getAcquiredCredits(detail.courseName, {
            upToYear,
            includeExclusiveGroup: true,
            includeSameYear: false,
            courseMetadata,
          });

        const records = useTranscriptsStore.getState().transcripts;
        const enrolled = records.reduce((sum, r) => {
          if (r.course_name !== detail.courseName) return sum;
          if (r.status !== "履修") return sum;
          if (typeof upToYear === "number") {
            if (r.year < upToYear) return sum + (r.credits || 0);
            return sum;
          }
          return sum + (r.credits || 0);
        }, 0);

        if (!mounted) return;
        setAcquiredCredits(acquired);
        setEnrolledCredits(enrolled);
      } catch (err) {
        console.error("Failed to compute credits for CourseDetail", err);
        if (mounted) {
          setAcquiredCredits(null);
          setEnrolledCredits(null);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [detail, currentYear]);

  if (!detail && !isLoading) {
    return null;
  }

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <p className="text-xl font-semibold">
            {detail ? `${detail.abbr} ${detail.section}`.trim() : "授業詳細"}
          </p>
          {detail && (
            <p className="text-sm text-muted-foreground mt-1">
              {detail.courseName}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && !detail && (
          <div className="text-sm text-muted-foreground py-10 text-center">
            読み込み中
          </div>
        )}
        {detail && (
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-20 font-medium">教科</TableCell>
                <TableCell>{detail.subject}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-20 font-medium">単位数</TableCell>
                <TableCell>{detail.credits}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-20 font-medium">前提科目</TableCell>
                <TableCell>
                  <PrerequisiteList
                    courseName={detail.courseName}
                    fallback={detail.prerequisite}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-20 font-medium">履修状況</TableCell>
                <TableCell>
                  {(() => {
                    if (acquiredCredits === null || enrolledCredits === null) {
                      return detail.status ?? "未履修";
                    }
                    const parts: string[] = [];
                    if (enrolledCredits > 0)
                      parts.push(`${enrolledCredits}単位履修`);
                    if (acquiredCredits > 0)
                      parts.push(`${acquiredCredits}単位修得`);
                    if (parts.length === 0) return "未履修";
                    return parts.join(" / ");
                  })()}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      detail.courseName && onFillCourseSearch(detail.courseName)
                    }
                  >
                    他の開講時間
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        {!isLoading && !detail && (
          <div className="text-sm text-muted-foreground py-10 text-center">
            授業を選択すると詳細が表示されます。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
