import * as React from "react"
import { cn } from "cn"
import { RiArrowDownSLine, RiSearchLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  getChildren,
  getProvinces,
  hasTowns,
  loadTowns,
  resolvePath,
  searchRegions,
  type Region,
  type RegionMatch,
} from "@kismet/core/region"

/** 面板至少并排这么多栏，不足的显示占位 */
const MIN_COLUMNS = 3

/** 搜索输入的防抖毫秒数 */
const SEARCH_DEBOUNCE = 150

/** 搜索最多返回多少条 */
const SEARCH_LIMIT = 60

const LEVEL_LABELS: Record<Region["level"], string> = {
  province: "省",
  city: "市",
  county: "区县",
  town: "乡镇",
}

/** 某一级的候选列表 */
function Column({
  items,
  selected,
  loading,
  onPick,
}: {
  items: Region[] | null
  selected?: Region
  loading: boolean
  onPick: (region: Region) => void
}) {
  if (loading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center text-xs text-muted-foreground">
        载入中
      </div>
    )
  }

  if (!items) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
        选好上一级后显示
      </div>
    )
  }

  return (
    <ul className="min-w-0 flex-1 overflow-y-auto py-1">
      {items.map((region) => (
        <li key={region.code}>
          <button
            type="button"
            onClick={() => onPick(region)}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              region.code === selected?.code && "bg-accent text-accent-foreground"
            )}
          >
            <span className="truncate">{region.name}</span>
            {(getChildren(region.code).length > 0 || hasTowns(region.code)) && (
              <RiArrowDownSLine className="size-3.5 -rotate-90 shrink-0 text-muted-foreground" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface RegionCascaderProps {
  /** 已选中的层级路径，从省开始 */
  path: readonly Region[]
  onChange: (path: Region[]) => void
}

/**
 * 出生地选择
 *
 * 一个弹层里把各级并排展开，点哪一级右边就跟着换，不必逐级展开再收起。
 * 顶部的搜索框跨级匹配，省市区县乡镇都能直接命中，选中后三栏会定位到它所在的位置。
 *
 * 层级数不固定：直筒子市的镇街直接挂在市下，直辖市的区县直接挂在省下，
 * 所以栏数由数据决定，不写死。
 */
export function RegionCascader({ path, onChange }: RegionCascaderProps) {
  const [open, setOpen] = React.useState(false)
  const [columns, setColumns] = React.useState<Region[][]>(() => [getProvinces()])
  const [loadingLevel, setLoadingLevel] = React.useState<number | null>(null)
  const [query, setQuery] = React.useState("")
  // 结果连同它对应的关键词一起存，关键词变了就知道手上这批结果已经过时
  const [result, setResult] = React.useState<{
    keyword: string
    matches: RegionMatch[]
  }>({ keyword: "", matches: [] })

  const keyword = query.trim()

  React.useEffect(() => {
    if (!keyword) return

    let alive = true
    const timer = setTimeout(() => {
      void searchRegions(keyword, { limit: SEARCH_LIMIT }).then((matches) => {
        if (alive) setResult({ keyword, matches })
      })
    }, SEARCH_DEBOUNCE)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [keyword])

  const settled = result.keyword === keyword
  const matches = settled ? result.matches : []
  const searching = keyword !== "" && !settled

  /** 为一条已确定的路径算出每一级的候选，用于把面板定位到该路径 */
  const columnsFor = async (regions: readonly Region[]) => {
    const result: Region[][] = [getProvinces()]
    for (const region of regions) {
      let children = getChildren(region.code)
      if (children.length === 0 && hasTowns(region.code)) {
        children = await loadTowns(region.code)
      }
      if (children.length === 0) break
      result.push(children)
    }
    return result
  }

  const pick = async (level: number, region: Region) => {
    onChange([...path.slice(0, level), region])

    let children = getChildren(region.code)
    if (children.length === 0 && hasTowns(region.code)) {
      setLoadingLevel(level + 1)
      try {
        children = await loadTowns(region.code)
      } finally {
        setLoadingLevel(null)
      }
    }

    setColumns((prev) =>
      children.length > 0
        ? [...prev.slice(0, level + 1), children]
        : prev.slice(0, level + 1)
    )

    // 已经到叶子，选择完成
    if (children.length === 0) {
      setOpen(false)
    }
  }

  const pickMatch = async (match: RegionMatch) => {
    const regions = await resolvePath(match.path)
    onChange(regions)
    setColumns(await columnsFor(regions))
    setQuery("")
    setOpen(false)
  }

  const columnCount = Math.max(MIN_COLUMNS, columns.length)
  const slots = Array.from({ length: columnCount }, (_, i) => columns[i] ?? null)
  const selectedText = path.map((r) => r.name).join(" ")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
            aria-label="选择出生地"
          />
        }
      >
        <span className={cn("truncate", !selectedText && "text-muted-foreground")}>
          {selectedText || "选择出生地"}
        </span>
        <RiArrowDownSLine className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[46rem] max-w-[92vw] gap-0 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <RiSearchLine className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索省、市、区县或乡镇"
            className="h-8 border-0 px-0 focus-visible:ring-0"
          />
        </div>

        {keyword ? (
          <div className="h-72 overflow-y-auto py-1">
            {searching && (
              <p className="px-3 py-2 text-xs text-muted-foreground">搜索中</p>
            )}
            {!searching && matches.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                没有匹配「{keyword}」的地名
              </p>
            )}
            {matches.map((match) => (
              <button
                key={match.code}
                type="button"
                onClick={() => void pickMatch(match)}
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="text-sm">{match.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {match.fullName}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {LEVEL_LABELS[match.level]}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-72 divide-x divide-border overflow-x-auto">
            {slots.map((items, level) => (
              <Column
                key={level}
                items={items}
                selected={path[level]}
                loading={loadingLevel === level}
                onPick={(region) => void pick(level, region)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
