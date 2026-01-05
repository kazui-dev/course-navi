import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


/**
 * この汎用コンポーネントが受け取る Props の型
 * @template T アイテムの型 (string または number)
 */
type DropdownSelectProps<T extends string | number> = {
  items: T[];
  currentItem: T | null;
  onItemSelect: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  placeholder: string;
  disabled?: boolean;
  allowReselect?: boolean;
  triggerClassName?: string;
  // 任意: 複数列で候補を渡す場合は `columns` を使う。
  // 例: columns = [[a,b],[c,d]] とすると左右に2列で表示される。
  columns?: T[][];
  // 任意: 各列の見出し（省略可）
  columnTitles?: (string | null)[];
  // 任意: SelectContent に渡すクラス名（max-h 等を上書きするため）
  contentClassName?: string;
  // 任意: 各列コンテナに付与するクラス名配列（例: ['w-44','w-32']）
  columnClassNames?: string[];
};


/**
 * 汎用的なドロップダウンコンポーネント
 */
export default function DropdownSelect<T extends string | number>({
  items,
  currentItem,
  onItemSelect,
  renderItem,
  placeholder,
  disabled = false,
  allowReselect = false,
  triggerClassName, columns, columnTitles, contentClassName, columnClassNames
}: DropdownSelectProps<T>) {

  const value = currentItem ? String(currentItem) : '';

  return (
    <Select
      value={value}
      onValueChange={(stringValue) => {
        const parsedValue = typeof items[0] === 'number'
          ? Number(stringValue)
          : stringValue;
        onItemSelect(parsedValue as T);
      }}
      disabled={disabled || !items || items.length === 0}
    >
      <SelectTrigger className={triggerClassName ?? "h-9 text-sm w-auto min-w-32"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={contentClassName ?? "max-h-[200px]"}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {columns && columns.length > 0 ? (
          <div className="p-1">
            <div className="flex gap-4">
              {columns.map((col, colIndex) => (
                <div key={colIndex} className={columnClassNames?.[colIndex] ?? "min-w-[8rem]"}>
                  {columnTitles && columnTitles[colIndex] ? (
                    <div className="px-1 py-1 text-xs font-semibold text-muted-foreground text-center">{columnTitles[colIndex]}</div>
                  ) : null}
                  {col && col.length > 0 ? (
                    col.map((item) => (
                      <SelectItem
                        key={String(item)}
                        value={String(item)}
                        className="text-sm"
                        onPointerDown={() => {
                          if (allowReselect && currentItem === item) {
                            onItemSelect(item as T);
                          }
                        }}
                      >
                        {renderItem(item as T)}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">選択肢がありません</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          items && items.length > 0 ? (
            items.map((item) => (
              <SelectItem
                key={item}
                value={String(item)}
                className="text-sm"
                onPointerDown={() => {
                  if (allowReselect && currentItem === item) {
                    onItemSelect(item);
                  }
                }}
              >
                {renderItem(item)}
              </SelectItem>
            ))
          ) : (
            <div className="p-2 text-sm text-muted-foreground">選択肢がありません</div>
          )
        )}
      </SelectContent>
    </Select>
  );
}
