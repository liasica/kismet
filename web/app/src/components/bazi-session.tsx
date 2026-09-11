/* eslint-disable react-refresh/only-export-components */
import type { BaziOptions } from "@kismet/core"
import { createSessionStore, type Session } from "@/components/session-store"
import { INITIAL_BAZI_OPTIONS } from "@/lib/bazi"

export type BaziSession = Session<BaziOptions>

const store = createSessionStore<BaziOptions>(
  "kismet.bazi",
  INITIAL_BAZI_OPTIONS
)

/** 八字模块的会话 */
export const BaziSessionProvider = store.Provider
export const useBaziSession = store.useSession
