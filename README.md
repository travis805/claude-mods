# claude-mods

Personal Claude Code mods, packaged as a plugin marketplace.

## Install

```bash
claude plugin marketplace add travis805/claude-mods
claude plugin install cache-timer@travis-mods
```

Update later with `claude plugin marketplace update travis-mods`.

## cache-timer

Shows a countdown above the prompt for how long the prompt cache stays warm
since the last main-thread response (1h by default; set the `ttl` option to
`5m` for API-key usage).

**Keep warm 3h:** sends a short automatic "reply ok" prompt shortly before the
cache expires, for up to 3 hours. Each ping is a real request and counts
against your usage. Press Stop to end it.
