import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastResponse } from '../types'

const last = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)
const isBusy = atom({ plugin: 'cache-timer', key: 'isBusy' } as const, false)
const keepUntil = atom({ plugin: 'cache-timer', key: 'keepUntil' } as const, 0)
const pings = atom({ plugin: 'cache-timer', key: 'pings' } as const, 0)

const WARN_MS = 5 * 60 * 1000
const KEEP_WARM_MS = 3 * 60 * 60 * 1000
const PING_TEXT = 'Cache keep-alive ping. Reply with only "ok" and do nothing else.'

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

export const register: Register = (on, options) => {
  const ttlMs = options.ttl === '5m' ? 5 * 60 * 1000 : 60 * 60 * 1000
  // Ping this long before expiry: enough slack for a queued or slow turn.
  const marginMs = options.ttl === '5m' ? 60 * 1000 : 3 * 60 * 1000
  let pingedFor = 0

  on('session.start', async ($, e, next) => {
    await update($, now, () => 0)
    $.clock.every(1000, () => {
      void (async () => {
        const t = await $.clock.now()
        await update($, now, () => t)

        const response = await read($, last)
        const until = await read($, keepUntil)
        if (response === null || until <= t || (await read($, isBusy))) {
          return
        }
        const left = response.at + ttlMs - t
        if (left > marginMs || left <= 0 || pingedFor === response.at) {
          return
        }
        pingedFor = response.at
        await update($, pings, n => n + 1)
        void $.prompt.submit({ text: PING_TEXT })
      })()
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, isBusy, () => true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, isBusy, () => false)

    return next(e)
  })

  // Each main-thread response refreshes the cache; subagents have their own prefixes.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage !== null) {
      const u = result.usage
      const stamp: LastResponse = {
        at: await $.clock.now(),
        tokens:
          u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens,
      }
      await update($, last, () => stamp)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const response = await read($, last)
    if (e.props.hasSurvey || response === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const t = (await read($, now)) || (await $.clock.now())
    const until = await read($, keepUntil)
    const isKeeping = until > t

    const keepControl = isKeeping ? (
      <Box>
        <Text dimColor>
          {' '}Keeping warm: {clock(until - t)} left, {await read($, pings)} pings{' '}
        </Text>
        <Button key="stop" label="Stop" onPress={() => update($, keepUntil, () => 0)} />
      </Box>
    ) : (
      <Box>
        <Text> </Text>
        <Button
          key="keep"
          label="Keep warm 3h"
          onPress={async () => {
            const start = await $.clock.now()
            await update($, pings, () => 0)
            await update($, keepUntil, () => start + KEEP_WARM_MS)
          }}
        />
      </Box>
    )

    if (await read($, isBusy)) {
      return (
        <Box>
          <Text dimColor>Cache: refreshing (turn in progress)</Text>
          {keepControl}
        </Box>
      )
    }

    const left = response.at + ttlMs - t
    if (left <= 0) {
      return (
        <Box>
          <Text color="red">
            Cache expired {clock(-left)} ago. Next message re-caches ~{kTokens(response.tokens)} tokens
          </Text>
          {keepControl}
        </Box>
      )
    }

    return (
      <Box>
        <Text color={left <= WARN_MS ? 'yellow' : 'green'}>Cache warm: {clock(left)} left</Text>
        <Text dimColor> ({kTokens(response.tokens)} tokens)</Text>
        {keepControl}
      </Box>
    )
  })
}
