import { dbClient } from "@/services/dbClient";

import type {
  PrerequisiteRuleRecord,
  PrerequisiteViolation,
  RuleStatus,
  TranscriptData,
  UserProfile,
} from "@/types";

type LogicalCondition = "AND" | "OR";

type RuleNode =
  | { type: "logical"; condition: LogicalCondition; rules: RuleNode[] }
  | { type: "course"; name: string; status: RuleStatus; credits: number }
  | { type: "subject"; name: string; status: RuleStatus; credits: number }
  | { type: "forbidden" };

interface StatusCredits {
  履修: number;
  修得: number;
}

interface ValidationContext {
  transcriptCourseCredits: Map<string, StatusCredits>;
  transcriptSubjectCredits: Map<string, StatusCredits>;
}

interface ValidationParams {
  courseName: string;
  year: number;
  transcripts: TranscriptData[];
}

const createStatusCredits = (): StatusCredits => ({ 履修: 0, 修得: 0 });

const courseSubjectCache = new Map<number, Map<string, string>>();

const ensureCourseSubjectMap = async (
  year: number,
): Promise<Map<string, string>> => {
  if (courseSubjectCache.has(year)) {
    const existing = courseSubjectCache.get(year);
    if (existing !== undefined) return existing;
  }
  const courses = await dbClient.fetchCourseMetadata(year);
  const map = new Map<string, string>();
  courses.forEach((course) => {
    map.set(course.course, course.subject);
  });
  courseSubjectCache.set(year, map);
  return map;
};

const buildCourseSubjectMaps = async (
  years: number[],
): Promise<Map<number, Map<string, string>>> => {
  const uniqueYears = Array.from(
    new Set(years.filter((year) => Number.isFinite(year))),
  );
  if (uniqueYears.length === 0) {
    return new Map();
  }
  const entries = await Promise.all(
    uniqueYears.map(async (year) => {
      const map = await ensureCourseSubjectMap(year);
      return [year, map] as const;
    }),
  );
  return new Map(entries);
};

const buildTranscriptCreditMaps = (
  transcripts: TranscriptData[],
  courseSubjectMaps: Map<number, Map<string, string>>,
) => {
  const courseCredits = new Map<string, StatusCredits>();
  const subjectCredits = new Map<string, StatusCredits>();

  transcripts.forEach((record) => {
    const courseBucket = getStatusBucket(courseCredits, record.course_name);
    courseBucket[record.status] += record.credits;

    const subjectName = courseSubjectMaps
      .get(record.year)
      ?.get(record.course_name);
    if (subjectName) {
      const subjectBucket = getStatusBucket(subjectCredits, subjectName);
      subjectBucket[record.status] += record.credits;
    }
  });

  return { courseCredits, subjectCredits };
};

const getStatusBucket = (
  map: Map<string, StatusCredits>,
  key: string,
): StatusCredits => {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const bucket = createStatusCredits();
  map.set(key, bucket);
  return bucket;
};

const isRuleApplicable = (
  rule: PrerequisiteRuleRecord,
  profile: UserProfile | null,
): boolean => {
  const departmentMatch =
    !rule.target_department ||
    rule.target_department.includes(profile?.department ?? "");
  const userGraduating = profile?.is_graduating_year ?? 0;
  const graduatingMatch =
    rule.if_graduating === null || rule.if_graduating === userGraduating;
  return departmentMatch && graduatingMatch;
};

const parseRuleNode = (raw: unknown): RuleNode | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const node = raw as Record<string, unknown>;
  if (node.type === "forbidden") {
    return { type: "forbidden" };
  }
  if (node.type === "logical") {
    const condition = node.condition === "OR" ? "OR" : "AND";
    const rules = Array.isArray(node.rules)
      ? node.rules
          .map(parseRuleNode)
          .filter((child): child is RuleNode => Boolean(child))
      : [];
    return { type: "logical", condition, rules };
  }
  if (node.type === "course" || node.type === "subject") {
    const name = typeof node.name === "string" ? node.name : "";
    if (!name) {
      return null;
    }
    const status: RuleStatus = node.status === "修得" ? "修得" : "履修";
    const credits =
      typeof node.credits === "number"
        ? node.credits
        : Number(node.credits) || 0;
    return {
      type: node.type,
      name,
      status,
      credits: Math.max(0, credits),
    } as RuleNode;
  }
  return null;
};

const parseRuleLogic = (logic: string): RuleNode | null => {
  try {
    const parsed = JSON.parse(logic);
    return parseRuleNode(parsed);
  } catch (error) {
    console.error("Failed to parse prerequisite rule logic", error);
    return null;
  }
};

const getTranscriptCredits = (
  map: Map<string, StatusCredits>,
  name: string,
  status: RuleStatus,
): number => {
  const bucket = map.get(name);
  if (!bucket) {
    return 0;
  }
  if (status === "履修") {
    return bucket.履修 + bucket.修得;
  }
  return bucket.修得;
};

interface EvaluationResult {
  passed: boolean;
  description: string;
  missingDescriptions: string[];
  indicatesAlternative?: boolean;
}

const evaluateNode = (
  node: RuleNode,
  context: ValidationContext,
): EvaluationResult => {
  if (node.type === "forbidden") {
    return {
      passed: false,
      description: "履修不可",
      missingDescriptions: ["この科目は履修できません"],
    };
  }
  if (node.type === "logical") {
    if (node.rules.length === 0) {
      const isAnd = node.condition === "AND";
      return {
        passed: isAnd,
        description: "条件なし",
        missingDescriptions: isAnd ? [] : ["条件が設定されていません"],
      };
    }
    const childResults = node.rules.map((rule) => evaluateNode(rule, context));
    // 説明文生成ロジックを関数分割
    const BLANK_LINE_HTML = '<span style="display:block;height:0.25em"></span>';
    function buildDescriptionLines(
      results: EvaluationResult[],
      condition: LogicalCondition,
    ): string[] {
      if (condition === "AND") {
        // AND条件は縦並び、区切りごとに最小空白行
        return results.flatMap((child, idx) => {
          const lines = child.description
            .split("\n")
            .filter((line) => line.trim() !== "");
          if (idx > 0) {
            return [BLANK_LINE_HTML, ...lines];
          }
          return lines;
        });
      } else {
        // OR条件は「または」単独行で区切る（空白行は挿入しない）
        return results.flatMap((child, idx) => {
          const lines = child.description.split("\n");
          if (idx > 0) {
            return ["または", ...lines];
          }
          return lines;
        });
      }
    }
    const descriptionLines = buildDescriptionLines(
      childResults,
      node.condition,
    );
    const description = descriptionLines
      .filter((line) => line.trim() !== "")
      .join("\n");
    if (node.condition === "AND") {
      const passed = childResults.every((result) => result.passed);
      const missingDescriptions = passed
        ? []
        : childResults.flatMap((result) => result.missingDescriptions);
      const indicatesAlternative = childResults.some(
        (result) => result.indicatesAlternative,
      );
      return { passed, description, missingDescriptions, indicatesAlternative };
    }
    const passed = childResults.some((result) => result.passed);
    if (passed) {
      return { passed: true, description, missingDescriptions: [] };
    }
    const detail = childResults.flatMap((result) => result.missingDescriptions);
    return {
      passed: false,
      description,
      missingDescriptions: detail,
      indicatesAlternative: true,
    };
  }

  const description =
    node.status === "履修"
      ? `「${node.name}」`
      : `「${node.name}」${node.credits}単位修得`;
  const transcriptMap =
    node.type === "course"
      ? context.transcriptCourseCredits
      : context.transcriptSubjectCredits;

  const transcriptCredits = getTranscriptCredits(
    transcriptMap,
    node.name,
    node.status,
  );
  const passed = transcriptCredits >= node.credits;

  return {
    passed,
    description,
    missingDescriptions: passed ? [] : [description],
  };
};

export const validatePrerequisites = async ({
  courseName,
  year,
  transcripts,
}: ValidationParams): Promise<PrerequisiteViolation | null> => {
  if (!courseName || !Number.isFinite(year)) {
    return null;
  }

  const [rules, profile] = await Promise.all([
    dbClient.fetchPrerequisiteRules(courseName, year),
    dbClient.fetchUserProfile(year),
  ]);

  const applicableRules = rules.filter((rule) =>
    isRuleApplicable(rule, profile),
  );
  if (applicableRules.length === 0) {
    return null;
  }

  const filteredTranscripts = transcripts.filter(
    (record) => Number.isFinite(record.year) && record.year < year,
  );
  const transcriptYears = Array.from(
    new Set(filteredTranscripts.map((record) => record.year)),
  );
  const courseSubjectMaps = await buildCourseSubjectMaps(transcriptYears);

  const transcriptCredits = buildTranscriptCreditMaps(
    filteredTranscripts,
    courseSubjectMaps,
  );
  const context: ValidationContext = {
    transcriptCourseCredits: transcriptCredits.courseCredits,
    transcriptSubjectCredits: transcriptCredits.subjectCredits,
  };

  for (const rule of applicableRules) {
    const logicNode = parseRuleLogic(rule.rule_logic_json);
    if (!logicNode) {
      continue;
    }
    const evaluation = evaluateNode(logicNode, context);
    if (!evaluation.passed) {
      return {
        messages:
          evaluation.missingDescriptions.length > 0
            ? evaluation.missingDescriptions
            : ["条件を満たしていません"],
        rule,
        description: evaluation.description,
        indicatesAlternative: evaluation.indicatesAlternative ?? false,
      };
    }
  }

  return null;
};
