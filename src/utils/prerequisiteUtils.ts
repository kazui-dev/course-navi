import { dbClient } from '@/services/dbClient';

const buildLinesFromRaw = (rawMsg: string) => {
  const withoutSpans = rawMsg.replace(/<span[^>]*>\s*<\/span>/g, '\n');
  const lines = withoutSpans.split('\n').map((l: string) => l.trim());
  const merged: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (!cur) {
      if (merged.length === 0 || merged[merged.length - 1] !== '') merged.push('');
      i += 1;
      continue;
    }
    let seq = [cur];
    let j = i;
    while (j + 2 < lines.length && lines[j + 1] === 'または' && lines[j + 2]) {
      seq.push(lines[j + 2]);
      j += 2;
    }
    if (seq.length > 1) {
      merged.push(seq.join(' または '));
      i = j + 1;
    } else {
      merged.push(cur);
      i += 1;
    }
  }
  const cleaned: string[] = [];
  for (const line of merged) {
    if (line === '') {
      if (cleaned.length === 0 || cleaned[cleaned.length - 1] === '') continue;
      cleaned.push('');
    } else {
      cleaned.push(line);
    }
  }
  while (cleaned.length && cleaned[0] === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();
  return cleaned.join('\n');
};

export const formatRuleLogic = (raw: unknown): string => {
  if (!raw || typeof raw !== 'object') return '';
  const node = raw as any;
  if (node.type === 'logical') {
    if (typeof node.label === 'string' && node.label.trim()) {
      const label = String(node.label).trim();
      const children = Array.isArray(node.rules) ? node.rules : [];
      let hasCourseOrSubject = false;
      let allShutoku = true;
      const creditSet = new Set<number>();
      for (const ch of children) {
        if (!ch || typeof ch !== 'object') continue;
        const t = ch.type;
        if (t === 'course' || t === 'subject') {
          hasCourseOrSubject = true;
          const status = ch.status === '修得' ? '修得' : '履修';
          if (status !== '修得') allShutoku = false;
          const c = typeof ch.credits === 'number' ? ch.credits : Number(ch.credits) || 0;
          creditSet.add(c);
        }
      }
      if (hasCourseOrSubject && allShutoku && creditSet.size === 1) {
        const credits = Array.from(creditSet)[0];
        if (credits > 0) return `「${label}」${credits}単位修得`;
      }
      return `「${label}」`;
    }
    const condition = node.condition === 'OR' ? 'OR' : 'AND';
    const child = Array.isArray(node.rules) ? node.rules.map(formatRuleLogic).filter(Boolean) : [];
    if (condition === 'AND') return child.join('\n');
    return child.join(' または ');
  }
  if (node.type === 'course' || node.type === 'subject') {
    const name = typeof node.name === 'string' ? node.name : '';
    const status = node.status === '修得' ? '修得' : '履修';
    const credits = typeof node.credits === 'number' ? node.credits : Number(node.credits) || 0;
    if (!name) return '';
    return status === '履修' ? `「${name}」` : `「${name}」${credits}単位修得`;
  }
  return '';
};

export const formatPrereqConfirmation = async (courseName: string, raw?: string, year?: number) => {
  const title = `前提条件違反: ${courseName}`;
  const bodyHeader = ['警告を無視して登録しますか？', '', '前提科目'].join('\n');

  if (year && Number.isFinite(year)) {
    try {
      const [rules, profile] = await Promise.all([
        dbClient.fetchPrerequisiteRules(courseName, year),
        dbClient.fetchUserProfile(year),
      ]);
      const applicable = (rules || []).filter(rule => {
        const departmentMatch = !rule.target_department || rule.target_department.includes(profile?.department ?? '');
        const userGraduating = profile?.is_graduating_year ?? 0;
        const graduatingMatch = rule.if_graduating === null || rule.if_graduating === userGraduating;
        return departmentMatch && graduatingMatch;
      });

      const parts: string[] = [];
      for (const r of applicable) {
        try {
          const parsed = JSON.parse(r.rule_logic_json);
          const desc = formatRuleLogic(parsed).trim();
          if (desc) parts.push(desc);
        } catch (_e) {
          // なにもしない
        }
      }
      if (parts.length > 0) {
        const message = `${bodyHeader}\n${parts.join('\n\n')}`;
        return { title, message };
      }
    } catch (_err) {
      // ignore
    }
  }

  const rawMsg = raw ?? '前提科目の条件を満たしていません。登録しますか？';
  const sanitized = buildLinesFromRaw(rawMsg);
  const message = `${bodyHeader}\n${sanitized}`;
  return { title, message };
};

export default formatPrereqConfirmation;
