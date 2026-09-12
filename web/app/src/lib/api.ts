/**
 * 接口服务地址
 *
 * 排盘在浏览器本地完成，只有命理解读经 Go 服务转发。
 * 开发时 Vite 把 `/api` 代理到 Go 服务，部署时同源或用 `VITE_API_BASE` 指定
 */

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ""

/** 抛出来的任何东西转成可展示的文字 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 接口的错误响应：给人看的文案，以及部分错误带的机器可读标识 */
export interface ApiError {
  message: string
  code?: string
}

/** 读取接口的 JSON 错误，读不出来时用状态码兜底 */
export async function readErrorDetail(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown }
    return {
      message:
        typeof body.error === "string" && body.error
          ? body.error
          : `接口返回 ${res.status}`,
      code: typeof body.code === "string" && body.code ? body.code : undefined,
    }
  } catch {
    // 响应不是 JSON
    return { message: `接口返回 ${res.status}` }
  }
}

/** 读取接口的 JSON 错误信息，读不出来时用状态码兜底 */
export async function readError(res: Response): Promise<string> {
  return (await readErrorDetail(res)).message
}
