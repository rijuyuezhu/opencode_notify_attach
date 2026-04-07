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
    const calls: Array<{ event: string; message: string; scriptPath: string }> = []
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "web",
      readConfig: () => JSON.stringify({ enableOnDesktop: true }),
      runNotify: async (scriptPath, event, message) => {
        calls.push({ scriptPath, event, message })
      },
    })

    await plugin.event?.({ event: { type: "permission.asked" } })
    await plugin.event?.({ event: { type: "session.idle" } })
    await plugin.event?.({ event: { type: "session.error" } })
    await plugin["tool.execute.before"]?.({ tool: "question" })
    await plugin["tool.execute.before"]?.({ tool: "plan_exit" })

    expect(calls).toEqual([
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "permission",
        message: "Session needs permission",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "complete",
        message: "Session has finished",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "error",
        message: "Session encountered an error",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "question",
        message: "Session has a question",
      },
      {
        scriptPath: "/work/project/bin/notify-if-attach",
        event: "plan_exit",
        message: "Plan ready for review",
      },
    ])
  })

  test("respects disabled events and permission.ask fallback", async () => {
    const calls: Array<{ event: string; message: string }> = []
    const plugin = await createAttachNotifyPlugin({
      directory: "/work/project",
      clientEnv: "cli",
      readConfig: () => JSON.stringify({
        events: { complete: false },
        messages: { permission: "Ask fallback" },
      }),
      runNotify: async (_scriptPath, event, message) => {
        calls.push({ event, message })
      },
    })

    await plugin.event?.({ event: { type: "session.idle" } })
    await plugin["permission.ask"]?.()

    expect(calls).toEqual([{ event: "permission", message: "Ask fallback" }])
  })
})
