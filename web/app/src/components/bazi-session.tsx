/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import type { PaipanOptions } from "@kismet/core"
import { INITIAL_OPTIONS } from "@/lib/bazi"
import { INITIAL_BIRTH_INFO, type BirthInfo } from "@/lib/birth-info"

/** 八字模块最近一次提交的表单值与提交状态，表单页提交、收藏页打开报告时写，报告页读 */
export interface BaziSession {
  birth: BirthInfo
  options: PaipanOptions
  /** 最近一次提交的时间戳，未提交为 0；报告页据此判断有没有内容，也用它重建解读面板 */
  submittedAt: number
  /** 本次报告在已保存报告里的 id，提交表单或打开已保存的报告时设定 */
  reportId: string
}

const STORAGE_KEY = "kismet.bazi"

const INITIAL: BaziSession = {
  birth: INITIAL_BIRTH_INFO,
  options: INITIAL_OPTIONS,
  submittedAt: 0,
  reportId: "",
}

/** 从 sessionStorage 恢复，刷新报告页不丢内容 */
function load(): BaziSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return { ...INITIAL, ...(JSON.parse(raw) as Partial<BaziSession>) }
  } catch {
    // 存储不可用或内容损坏，用初始值
  }
  return INITIAL
}

type Store = readonly [BaziSession, (next: BaziSession) => void]

const BaziSessionContext = React.createContext<Store | undefined>(undefined)

export function BaziSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, setSession] = React.useState<BaziSession>(load)

  const update = React.useCallback((next: BaziSession) => {
    setSession(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // 存储不可用时只保留在内存里
    }
  }, [])

  const store = React.useMemo<Store>(() => [session, update], [session, update])

  return (
    <BaziSessionContext.Provider value={store}>
      {children}
    </BaziSessionContext.Provider>
  )
}

export function useBaziSession(): Store {
  const store = React.useContext(BaziSessionContext)
  if (!store) {
    throw new Error("useBaziSession 需要在 BaziSessionProvider 内使用")
  }
  return store
}
