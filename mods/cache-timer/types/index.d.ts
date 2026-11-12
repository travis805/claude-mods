export type LastResponse = { at: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': {
      last: LastResponse | null
      now: number
      isBusy: boolean
      keepUntil: number
      pings: number
    }
  }
}
