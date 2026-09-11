import * as React from "react"

import { INITIAL_BIRTH_INFO, type BirthInfo } from "@/lib/birth-info"

/** 某个体系最近一次提交的表单值与提交状态，表单页提交、收藏页打开报告时写，报告页读 */
export interface Session<TOptions> {
  birth: BirthInfo
  options: TOptions
  /** 最近一次提交的时间戳，未提交为 0；报告页据此判断有没有内容，也用它重建解读面板 */
  submittedAt: number
  /** 本次报告在已保存报告里的 id，提交表单或打开已保存的报告时设定 */
  reportId: string
}

type Store<TOptions> = readonly [
  Session<TOptions>,
  (next: Session<TOptions>) => void,
]

export interface SessionStore<TOptions> {
  Provider: React.ComponentType<{ children: React.ReactNode }>
  useSession: () => Store<TOptions>
}

/**
 * 按存储键生成一套 Provider 与 hook
 *
 * 会话写进 sessionStorage，刷新报告页不丢；表单草稿不进会话，提交时才写
 */
export function createSessionStore<TOptions>(
  storageKey: string,
  initialOptions: TOptions
): SessionStore<TOptions> {
  const initial: Session<TOptions> = {
    birth: INITIAL_BIRTH_INFO,
    options: initialOptions,
    submittedAt: 0,
    reportId: "",
  }

  const load = (): Session<TOptions> => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        return {
          ...initial,
          ...(JSON.parse(raw) as Partial<Session<TOptions>>),
        }
      }
    } catch {
      // 存储不可用或内容损坏，用初始值
    }
    return initial
  }

  const Context = React.createContext<Store<TOptions> | undefined>(undefined)

  function Provider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = React.useState<Session<TOptions>>(load)

    const update = React.useCallback((next: Session<TOptions>) => {
      setSession(next)
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // 存储不可用时只保留在内存里
      }
    }, [])

    const store = React.useMemo<Store<TOptions>>(
      () => [session, update],
      [session, update]
    )

    return <Context.Provider value={store}>{children}</Context.Provider>
  }

  function useSession(): Store<TOptions> {
    const store = React.useContext(Context)
    if (!store) {
      throw new Error(`useSession 需要在 ${storageKey} 的 Provider 内使用`)
    }
    return store
  }

  return { Provider, useSession }
}
