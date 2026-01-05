import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCourseSearchStore } from '@/stores';
import type { CourseMetadata } from '@/types';
import { normalizeForSearch, katakanaToHiragana } from '@/lib/utils';


/** このコンポーネントが受け取る Props の型 */
type CourseSearchProps = {
  allCourses: { course: string; abbr: string; alias: string[] }[];
  currentYear: number | null;
};

type Suggestion = Pick<CourseMetadata, 'course' | 'abbr'>;


export default function CourseSearch({
  allCourses,
  currentYear
}: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const autoFillRequest = useCourseSearchStore(state => state.autoFillRequest);
  const clearAutoFillRequest = useCourseSearchStore(state => state.clearAutoFillRequest);
  const runCourseSearch = useCourseSearchStore(state => state.runSearch);
  const clearSearchResults = useCourseSearchStore(state => state.clearSearchResults);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) {
      return;
    }
    const activeItem = listRef.current.children[activeIndex] as HTMLElement;
    if (activeItem) {
      activeItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [activeIndex, suggestions]);

  const executeSearch = useCallback((name: string) => {
    runCourseSearch(name, currentYear);
  }, [runCourseSearch, currentYear]);

  // 事前インデックス（allCourses が変わったら再構築）
  const [indexed, setIndexed] = useState<Array<{ course: string; abbr: string; alias: string[]; _search: string }>>([]);
  useEffect(() => {
    const built = allCourses.map(c => {
      let aliasArr: string[] = [];
      if (Array.isArray(c.alias)) aliasArr = c.alias.map(String);
      else if (typeof c.alias === 'string') aliasArr = [c.alias];

      const addNormalized = (val: string) => {
        const base = normalizeForSearch(val);
        const hira = normalizeForSearch(katakanaToHiragana(val));
        return base === hira ? [base] : [base, hira];
      };

      const tokens: string[] = [];
      tokens.push(...addNormalized(c.course));
      tokens.push(...addNormalized(c.abbr));
      for (const a of aliasArr) tokens.push(...addNormalized(a));

      const unique = Array.from(new Set(tokens));
      const _search = unique.join(' ');
      return { ...c, _search };
    });
    setIndexed(built);
  }, [allCourses]);

  const updateSuggestions = (value: string) => {
    if (value.trim() === '') {
      setSuggestions([]);
      return;
    }
    const qBase = normalizeForSearch(value);
    const qHira = normalizeForSearch(katakanaToHiragana(value));
    const filtered = indexed.filter(item => {
      if (qBase && item._search.includes(qBase)) return true;
      if (qHira && item._search.includes(qHira)) return true;
      return false;
    }).map(i => ({ course: i.course, abbr: i.abbr }));
    setSuggestions(filtered);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();

    const name = searchTerm.trim();
    setSearchTerm(name)

    setSuggestions([]);
    setActiveIndex(-1);
    setIsFocused(false);

    executeSearch(name);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setActiveIndex(-1);
    setIsFocused(true);

    if (newValue === '') {
      clearSearchResults();
    }
    updateSuggestions(newValue);
  };

  const handleSuggestionClick = (courseName: string) => {
    setSearchTerm(courseName);
    setSuggestions([]);
    setActiveIndex(-1);
    setIsFocused(false);

    executeSearch(courseName);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        if (activeIndex > -1) {
          e.preventDefault();
          handleSuggestionClick(suggestions[activeIndex].course);
        }
        break;
      case 'Escape':
        setSuggestions([]);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    updateSuggestions(searchTerm);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsFocused(false);
    }, 150);
  };

  useEffect(() => {
    if (!autoFillRequest) return;
    const { value } = autoFillRequest;
    setSearchTerm(value);
    setSuggestions([]);
    setActiveIndex(-1);
    setIsFocused(false);
    executeSearch(value);
    clearAutoFillRequest();
  }, [autoFillRequest, executeSearch, clearAutoFillRequest]);

  return (
    <Popover open={isFocused && suggestions.length > 0}>
      <form onSubmit={handleSubmit} className="w-full">
        <PopoverTrigger asChild>
          <Input
            type="search"
            placeholder="授業を検索"
            className="text-sm"
            value={searchTerm}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            autoComplete="off"
          />
        </PopoverTrigger>
      </form>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 max-h-[300px] overflow-y-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div
          ref={listRef}
          className="border-t"
        >
          {suggestions.map((s, index) => (
            <div
              key={s.course}
              onMouseDown={() => handleSuggestionClick(s.course)}
              className={`px-3 py-2 text-sm cursor-pointer border-b last:border-b-0 ${index === activeIndex ? 'bg-accent' : 'hover:bg-muted'
                }`}
            >
              {s.course}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}