export function getSessionBridgeUrl(currentUrl: string) {
  const bridgeUrl = new URL('https://login.dailin.tech/auth/bridge')
  bridgeUrl.searchParams.set('next', currentUrl)
  return bridgeUrl.toString()
}
