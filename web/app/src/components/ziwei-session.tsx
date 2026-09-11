/* eslint-disable react-refresh/only-export-components */
import type { ZiweiOptions } from "@kismet/core"
import { createSessionStore, type Session } from "@/components/session-store"
import { INITIAL_ZIWEI_OPTIONS } from "@/lib/ziwei"

export type ZiweiSession = Session<ZiweiOptions>

const store = createSessionStore<ZiweiOptions>(
  "kismet.ziwei",
  INITIAL_ZIWEI_OPTIONS
)

/** 紫微模块的会话 */
export const ZiweiSessionProvider = store.Provider
export const useZiweiSession = store.useSession
