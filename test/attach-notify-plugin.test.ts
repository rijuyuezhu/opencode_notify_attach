import { describe, expect, test } from "bun:test"

import {
  createAttachNotifyPlugin,
  defaultAttachNotifyConfig,
  loadAttachNotifyConfig,
} from "../lib/attach-notify-plugin"

describe("loadAttachNotifyConfig", () => {
  test("resolves script path from config root when provided", () => {
    const config = loadAttachNotifyConfig({
      directory: "/work/project",
      configRoot: "/opt/opencode_notify_attach",
      readConfig: () => JSON.stringify({
        notifyScript: "./bin/notify-if-attach",
      }),
    })

    expect(config.notifyScript).toBe("/opt/opencode_notify_attach/bin/notify-if-attach")
  })

  test("loads defaults and resolves script path from project directory", () => {
    const config = loadAttachNotifyConfig({
      directory: "/work/project",
      readConfig: () => null,
    })

    expect(config).toEqual({
      ...defaultAttachNotifyConfig,
      notifyScript: "/work/project/bin/notify-if-attach",
    })
  })

  test("merges user config and resolves relative script path from project directory", () => {
    const config = loadAttachNotifyConfig({
      directory: "/work/project",
      readConfig: () => JSON.stringify({
        enableOnDesktop: true,
        notifyScript: "./scripts/custom-notify",
        events: { complete: false },
        messages: { question: "Custom question" },
      }),
    })

    expect(config.enableOnDesktop).toBe(true)
    expect(config.notifyScript).toBe("/work/project/scripts/custom-notify")
    expect(config.events.complete).toBe(false)
    expect(config.events.permission).toBe(true)
    expect(config.messages.question).toBe("Custom question")
  })
})

describe("createAttachNotifyPlugin", () => {
  test("skips non-cli clients unless enableOnDesktop is true", async () => {
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "web",
      readConfig: () => JSON.stringify({ enableOnDesktop: false }),
      runNotify: async () => {
        throw new Error("should not run")
      },
    })

    expect(plugin).toEqual({})
  })

  test("maps OpenCode events to notify-if-attach invocations", async () => {
    const calls: Array<{ event: string; title: string; message: string; scriptPath: string }> = []
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "web",
      readConfig: () => JSON.stringify({ enableOnDesktop: true }),
      client: {
        session: {
          get: async ({ path }: { path: { id: string } }) => ({
            data: path.id === "ses-1" ? { title: "Fix login bug" } : null,
          }),
        },
      },
      runNotify: async (scriptPath, event, title, message) => {
        calls.push({ scriptPath, event, title, message })
      },
    })

    await plugin.event?.({ event: { type: "permission.asked", properties: { sessionID: "ses-1" } } })
    await plugin.event?.({ event: { type: "session.idle", properties: { sessionID: "ses-1" } } })
    await plugin.event?.({ event: { type: "session.error", properties: { sessionID: "ses-1" } } })
    await plugin["tool.execute.before"]?.({ tool: "question", sessionID: "ses-1" })
    await plugin["tool.execute.before"]?.({ tool: "plan_exit" })

    expect(calls).toEqual([
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "permission",
        title: "Fix login bug",
        message: "Session needs permission",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "complete",
        title: "Fix login bug",
        message: "Session has finished",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "error",
        title: "Fix login bug",
        message: "Session encountered an error",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "question",
        title: "Fix login bug",
        message: "Session has a question",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "plan_exit",
        title: "OpenCode",
        message: "Plan ready for review",
      },
    ])
  })

  test("respects disabled events and permission.ask fallback", async () => {
    const calls: Array<{ event: string; title: string; message: string }> = []
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "cli",
      readConfig: () => JSON.stringify({
        events: { complete: false },
        messages: { permission: "Ask fallback" },
      }),
      runNotify: async (_scriptPath, event, title, message) => {
        calls.push({ event, title, message })
      },
    })

    await plugin.event?.({ event: { type: "session.idle" } })
    await plugin["permission.ask"]?.()

    expect(calls).toEqual([{ event: "permission", title: "OpenCode", message: "Ask fallback" }])
  })

  test("falls back to OpenCode when session lookup fails", async () => {
    const calls: Array<{ event: string; title: string; message: string }> = []
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "cli",
      client: {
        session: {
          get: async () => {
            throw new Error("boom")
          },
        },
      },
      runNotify: async (_scriptPath, event, title, message) => {
        calls.push({ event, title, message })
      },
    })

    await plugin.event?.({ event: { type: "session.error", properties: { sessionID: "ses-missing" } } })

    expect(calls).toEqual([
      {
        event: "error",
        title: "OpenCode",
        message: "Session encountered an error",
      },
    ])
  })
})
