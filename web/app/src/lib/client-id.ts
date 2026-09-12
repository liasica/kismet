/**
 * 浏览器指纹：解读接口按指纹与来源 IP 限免费次数
 *
 * 指纹库只在真要解读时动态载入，不占首屏；算出来的值在本次会话内复用。
 * 取不到时返回空串，服务端退化成整个 IP 当一个客户端
 */

let pending: Promise<string> | undefined

/** 本机的浏览器指纹 */
export function clientId(): Promise<string> {
  pending ??= resolve()
  return pending
}

async function resolve(): Promise<string> {
  try {
    const { default: FingerprintJS } = await import(
      "@fingerprintjs/fingerprintjs"
    )
    const agent = await FingerprintJS.load()
    const { visitorId } = await agent.get()
    return visitorId
  } catch {
    return ""
  }
}
