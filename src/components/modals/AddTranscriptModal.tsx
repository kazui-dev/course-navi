import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dbClient } from '@/services/dbClient';
import type { CourseMetadata, NewTranscriptData } from '@/types';
import { useTranscriptsStore, useSettingsStore } from '@/stores';
import { validatePrerequisites, buildClassName, parseClassName } from '@/utils';
import ClassSelect from '@/components/timetable/ClassSelect';

import { CourseCheckbox } from '@/components';
import { confirmService } from '@/lib/confirm';
import { X } from 'lucide-react';
import { toastService } from '@/lib/toast';

type AddTranscriptModalProps = {
  show: boolean;
  onHide: () => void;
};

type TranscriptInput = {
  course_name: string;
  year: number;
  status: '履修' | '修得';
  credits: number;
  maxCredits: number | null;
};

/** CourseMetadata を 教科(subject) ごとにグループ化する */
const groupCoursesBySubject = (courses: CourseMetadata[]): Record<string, CourseMetadata[]> => {
  return courses.reduce((acc, course) => {
    const { subject } = course;
    if (!acc[subject]) {
      acc[subject] = [];
    }
    acc[subject].push(course);
    return acc;
  }, {} as Record<string, CourseMetadata[]>);
};

export default function AddTranscriptModal({ show, onHide }: AddTranscriptModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const availableClasses = useSettingsStore(state => state.availableClasses);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [localAvailableClasses, setLocalAvailableClasses] = useState<string[]>([]);

  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata[]>([]);
  const [allowedCourses, setAllowedCourses] = useState<Set<string>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());

  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [inputs, setInputs] = useState<TranscriptInput[]>([]);

  const [filterText, setFilterText] = useState("");
  const addTranscripts = useTranscriptsStore(state => state.addTranscripts);
  const transcripts = useTranscriptsStore(state => state.transcripts);
  useEffect(() => {
    if (show) {
      const loadYears = async () => {
        const years = await dbClient.fetchAvailableYearsForTranscripts();
        setAvailableYears(years);
        // 初回は未設定 (null) にして placeholder を表示する。
        try {
          const LS_KEY = 'addTranscript.lastSelectedYear';
          const stored = localStorage.getItem(LS_KEY);
          if (stored) {
            const num = Number(stored);
            if (Number.isFinite(num) && years.includes(num)) {
              setSelectedYear(num);
            } else {
              setSelectedYear(null);
            }
          } else {
            setSelectedYear(null);
          }
        } catch (err) {
          setSelectedYear(null);
        }
      };
      loadYears();
    }
  }, [show]);

  // selectedYear が変わったら settingsStore 側に同期して、その年の class を初期値として取り込む
  // また、年度が切り替わった場合は Step2 のチェックや Step3 の入力をクリアする
  useEffect(() => {
    if (selectedYear == null) {
      setSelectedClass(null);
      setSelectedCourses(new Set());
      setInputs([]);
      setLocalAvailableClasses([]);
      return;
    }
    let cancelled = false;
    const loadForYear = async () => {
      try {
        const [profile, classes] = await Promise.all([
          dbClient.fetchUserProfile(selectedYear),
          dbClient.fetchAvailableClasses(selectedYear),
        ]);
        if (cancelled) return;
        setLocalAvailableClasses(classes ?? []);

        const cls = buildClassName(profile);
        setSelectedClass(cls);

        // 年度変更時は選択をクリア
        setSelectedCourses(new Set());
        setInputs([]);
      } catch (error) {
        console.error('Failed to load year-specific settings for selectedYear', error);
      }
    };
    loadForYear();
    return () => { cancelled = true; };
  }, [selectedYear]);

  useEffect(() => {
    if (step === 2 && selectedYear !== null) {
      setIsLoadingCourses(true);
      const loadCourses = async () => {
        const data = await dbClient.fetchCourseMetadata(selectedYear);
        setCourseMetadata(data);
        // transcripts を読み込んでおく（表示フィルタで使用するため）
        try {
          const store = useTranscriptsStore.getState();
          if (!store.isDataLoaded) {
            await store.loadTranscripts();
          }

          // 前提条件フィルタを事前計算して、違反する科目は候補から除外する
          const transcriptsList = useTranscriptsStore.getState().transcripts;
          const allowed = new Set<string>();
          for (const course of data) {
            try {
              const violation = await validatePrerequisites({
                courseName: course.course,
                year: selectedYear,
                transcripts: transcriptsList,
              });
              if (!violation) {
                allowed.add(course.course);
              }
            } catch (error) {
              allowed.add(course.course);
            }
          }
          setAllowedCourses(allowed);
        } catch (error) {
          console.error(error);
        } finally {
          setIsLoadingCourses(false);
        }
      };
      loadCourses();
    }
  }, [step, selectedYear]);

  const handleClose = () => {
    setStep(1);
    setSelectedYear(null);
    setCourseMetadata([]);
    setSelectedCourses(new Set());
    setFilterText("");
    setInputs([]);
    setIsSubmitting(false);
    onHide();
  };

  const handleNext = async () => {
    if (step === 2) {
      const selected = courseMetadata.filter(course => selectedCourses.has(course.course));
      // transcripts が読まれていることを保証
      const store = useTranscriptsStore.getState();
      if (!store.isDataLoaded) {
        await store.loadTranscripts();
      }
      const inputsForStep3: TranscriptInput[] = selected.map(course => {
        const acquiredSum = useTranscriptsStore.getState().getAcquiredCredits(course.course, { upToYear: selectedYear ?? undefined, includeExclusiveGroup: true, includeSameYear: true, courseMetadata });
        const explicitMax = course.max_credits; // number | null | undefined
        const maxCreditsVal: number | null = explicitMax === null ? null : (explicitMax ?? course.credits);
        const remaining = maxCreditsVal === null ? null : Math.max(0, maxCreditsVal - acquiredSum);
        const defaultCredits = maxCreditsVal === null ? course.credits : Math.min(course.credits, remaining as number);
        return {
          course_name: course.course,
          year: course.year,
          status: '修得',
          credits: defaultCredits,
          maxCredits: remaining as any,
        };
      });
      setInputs(inputsForStep3);
    }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const handleCourseToggle = useCallback((course_name: string) => {
    // Step2 では前提違反の科目は候補から除外しているため、ここでは単純にトグルする
    setSelectedCourses(prevSet => {
      const newSet = new Set(prevSet);
      if (newSet.has(course_name)) {
        newSet.delete(course_name);
      } else {
        newSet.add(course_name);
      }
      return newSet;
    });
  }, []);

  const handleInputChange = (index: number, field: 'status' | 'credits', value: string | number) => {
    setInputs(prevInputs =>
      prevInputs.map((input, i) => {
        if (i !== index) return input;
        if (field === 'credits') {
          let num = Number(value);
          if (!Number.isFinite(num) || Number.isNaN(num)) num = 0;
          if (input.maxCredits != null) {
            num = Math.max(0, Math.min(num, input.maxCredits));
          }
          return { ...input, credits: num };
        }
        return { ...input, status: value as '履修' | '修得' };
      })
    );
  };

  const handleRemoveClick = async (index: number) => {
    const course = inputs[index]?.course_name ?? null;
    const ok = await confirmService.confirm({ title: '選択解除の確認', message: `「${course ?? ''}」の選択を解除しますか？`, okLabel: '解除', cancelLabel: 'キャンセル' });
    if (!ok) return;
    const removedCourse = inputs[index]?.course_name;
    setInputs(prev => prev.filter((_, i) => i !== index));
    setSelectedCourses(prev => {
      const s = new Set(prev);
      if (removedCourse) s.delete(removedCourse);
      return s;
    });
  };


  const handleSubmit = async () => {
    try {
      const metadataByName: Record<string, CourseMetadata | undefined> = {};
      courseMetadata.forEach(m => { metadataByName[m.course] = m; });

      const groupCount: Record<string, number> = {};
      const conflictGroups: string[] = [];

      inputs.forEach(input => {
        const metadata = metadataByName[input.course_name];
        const groupMembers = (metadata && Array.isArray(metadata.exclusive_group) && metadata.exclusive_group.length > 0)
          ? new Set<string>([input.course_name, ...metadata!.exclusive_group!])
          : null;
        if (groupMembers) {
          const key = Array.from(groupMembers).sort().join('|');
          groupCount[key] = (groupCount[key] || 0) + 1;
          if (groupCount[key] > 1) {
            conflictGroups.push(key);
          }
        }
      });

      if (conflictGroups.length > 0) {
        const conflictCourseSet = new Set<string>();
        inputs.forEach(input => {
          const metadata = metadataByName[input.course_name];
          const groupMembers = (metadata && Array.isArray(metadata.exclusive_group) && metadata.exclusive_group.length > 0)
            ? new Set<string>([input.course_name, ...metadata!.exclusive_group!])
            : null;
          if (!groupMembers) return;
          const key = Array.from(groupMembers).sort().join('|');
          if (groupCount[key] > 1) {
            conflictCourseSet.add(input.course_name);
          }
        });

        const conflictList = Array.from(conflictCourseSet);
        const lines = ['どれか一つしか履修できません。'];
        conflictList.forEach(name => lines.push(`「${name}」`));
        const description = lines.join('\n');
        toastService.error({
          title: '保存失敗',
          description,
        });
        return;
      }

      setIsSubmitting(true);
      const records: NewTranscriptData[] = inputs.map(input => ({
        course_name: input.course_name,
        year: input.year,
        status: input.status,
        credits: input.credits
      }));

      const result = await addTranscripts(records);
      if (result.success) {
        handleClose();
      } else {
        console.error('Failed to insert:', result.error);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  // 上限超過を除外する処理は不要のため削除

  const coursesBySubject = useMemo(() => {
    const lowerFilter = filterText.toLowerCase().trim();

    const candidateList = courseMetadata.filter(course => {
      // フィルタテキスト条件
      if (lowerFilter) {
        const match = course.course.toLowerCase().includes(lowerFilter) ||
          (course.abbr && course.abbr.toLowerCase().includes(lowerFilter));
        if (!match) return false;
      }
      // 既に修得単位が max_credits に達している科目は除外する
      try {
        const explicitMax = course.max_credits;
        const maxCredits = explicitMax === null ? null : (explicitMax ?? course.credits);
        const acquired = useTranscriptsStore.getState().getAcquiredCredits(course.course, { upToYear: selectedYear ?? undefined, includeExclusiveGroup: true, includeSameYear: true, courseMetadata });
        if (maxCredits != null && !(acquired < maxCredits)) return false;
      } catch (error) {
        // なにもしない
      }

      // 前提条件チェックで弾かれている科目は候補から除外する
      if (allowedCourses && allowedCourses.size > 0) {
        if (!allowedCourses.has(course.course)) return false;
      }

      return true;
    });

    return groupCoursesBySubject(candidateList);
  }, [courseMetadata, filterText, transcripts, allowedCourses]);

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground pb-1">
              ※古い年度から順に記録を追加してください。
            </div>
            <Label htmlFor="yearSelect">履修した年度を選択してください（必須）</Label>
            <Select value={selectedYear?.toString() ?? ''} onValueChange={(value) => {
              const num = Number(value);
              setSelectedYear(num);
              try { localStorage.setItem('addTranscript.lastSelectedYear', value); } catch (_) { }
            }}>
              <SelectTrigger id="yearSelect">
                <SelectValue placeholder="年度を選択" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}年度</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="pt-2">
              <Label>
                {selectedYear !== null
                  ? `${selectedYear}年度のクラスを選択してください（必須）`
                  : '先に年度を選択してください（必須）'}
              </Label>
              <ClassSelect
                availableClasses={localAvailableClasses.length > 0 ? localAvailableClasses : availableClasses}
                currentClass={selectedClass}
                onClassChange={async (c) => {
                  setSelectedClass(c);
                  try {
                    if (selectedYear != null && c) {
                      const parsed = parseClassName(c);
                      if (parsed) {
                        await dbClient.upsertUserProfile(selectedYear, parsed.department, parsed.division, parsed.classNum);
                      }
                    }
                  } catch (error) {
                    console.error('Failed to upsert user profile for selectedYear', error);
                  }
                  try {
                    const globalYear = useSettingsStore.getState().currentYear;
                    if (selectedYear === globalYear) {
                      await useSettingsStore.getState().setCurrentClass(c);
                    }
                  } catch (error) {
                    console.error('Failed to set current class in settings store', error);
                  }
                }}
                disabled={selectedYear == null}
              />

            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-lg">{selectedYear}年度に履修した科目を選択してください</p>
              <p className="text-sm font-medium">{selectedCourses.size} 件選択中</p>
            </div>
            <p className="text-sm text-gray-600 mt-1">※前提条件を満たす科目のみ表示しています。既に修得済みの科目は表示されません。</p>
            <Input
              placeholder="科目名 / 略称で絞り込み"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {isLoadingCourses ? (
              <div className="h-[50vh] flex items-center justify-center border rounded">
                <p className="text-sm text-muted-foreground">読み込み中…</p>
              </div>
            ) : (
              <div className="h-[50vh] overflow-y-auto space-y-4 border rounded p-3">
                {Object.entries(coursesBySubject).map(([subject, courses]) => (
                  <div key={subject}>
                    <p className="font-semibold text-sm mb-2">{subject}</p>
                    <div className="flex flex-wrap gap-3">
                      {courses.map(course => (
                        <CourseCheckbox
                          key={course.course}
                          courseName={course.course}
                          courseAbbr={course.abbr}
                          isSelected={selectedCourses.has(course.course)}
                          onToggle={handleCourseToggle}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-3">
            <p className="text-sm">履修状況と単位数を入力してください</p>
            <div className="border rounded-lg">
              <div className="max-h-[50vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>科目名</TableHead>
                      <TableHead>履修状況（履修 / 修得）</TableHead>
                      <TableHead>単位数</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputs.map((input, index) => (
                      <TableRow key={input.course_name}>
                        <TableCell>{input.course_name}</TableCell>
                        <TableCell>
                          <Select value={input.status} onValueChange={(value) => handleInputChange(index, 'status', value)}>
                            <SelectTrigger className="w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="履修">履修</SelectItem>
                              <SelectItem value="修得">修得</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              className="w-16"
                              value={input.credits}
                              onChange={(e) => handleInputChange(index, 'credits', e.target.value)}
                              min={0}
                              max={input.maxCredits ?? undefined}
                            />
                            <span className="text-xs text-muted-foreground">
                              {input.maxCredits == null ? '上限なし' : `残り ${input.maxCredits} 単位`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleRemoveClick(index)}
                            aria-label={`削除 ${input.course_name}`}
                          >
                            <X size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={show} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>履修記録を追加</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {renderStepContent()}
        </div>
        <DialogFooter className="flex gap-2 justify-end">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
              戻る
            </Button>
          )}
          {step < 3 && (
            <Button onClick={handleNext} disabled={isLoadingCourses || (step === 1 && (!selectedClass || selectedYear == null))}>
              次へ
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? '保存中…' : '保存'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

