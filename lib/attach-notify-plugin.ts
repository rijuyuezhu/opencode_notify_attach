import { existsSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { spawn } from "node:child_process"

export type AttachNotifyEvent = "permission" | "complete" | "error" | "question" | "plan_exit"

type HookMap = {
  event?: (input: { event: { type: string } }) => Promise<void>
  "permission.ask"?: () => Promise<void>
  "tool.execute.before"?: (input: { tool: string }) => Promise<void>
}

type ReadConfig = () => string | null
type RunNotify = (scriptPath: string, event: AttachNotifyEvent, message: string) => Promise<void>

export interface AttachNotifyConfig {
  enableOnDesktop: boolean
  notifyScript: string
  events: Record<AttachNotifyEvent, boolean>
  messages: Record<AttachNotifyEvent, string>
}

export const defaultAttachNotifyConfig: AttachNotifyConfig = {
  enableOnDesktop: true,
  notifyScript: "./bin/notify-if-attach",
  events: {
    permission: true,
    complete: true,
    error: true,
    question: true,
    plan_exit: true,
  },
  messages: {
    permission: "Session needs permission",
    complete: "Session has finished",
    error: "Session encountered an error",
    question: "Session has a question",
    plan_exit: "Plan ready for review",
  },
}

function getProjectDirectory(directory?: string): string {
  return directory ?? process.cwd()
}

function getConfigRoot(configRoot?: string, directory?: string): string {
  return configRoot ?? getProjectDirectory(directory)
}

function getPluginConfigPath(configRoot?: string, directory?: string): string {
  return join(getConfigRoot(configRoot, directory), ".opencode", "attach-notify.json")
}

function mergeConfig(userConfig: Partial<AttachNotifyConfig>, directory?: string, configRoot?: string): AttachNotifyConfig {
  return {
    enableOnDesktop: userConfig.enableOnDesktop ?? defaultAttachNotifyConfig.enableOnDesktop,
    notifyScript: resolve(getConfigRoot(configRoot, directory), userConfig.notifyScript ?? defaultAttachNotifyConfig.notifyScript),
    events: {
      ...defaultAttachNotifyConfig.events,
      ...userConfig.events,
    },
    messages: {
      ...defaultAttachNotifyConfig.messages,
      ...userConfig.messages,
    },
  }
}

export function loadAttachNotifyConfig(options: { directory?: string; configRoot?: string; readConfig?: ReadConfig }): AttachNotifyConfig {
  const readConfig =
    options.readConfig ??
    (() => {
      const configPath = getPluginConfigPath(options.configRoot, options.directory)
      if (!existsSync(configPath)) {
        return null
      }
      return readFileSync(configPath, "utf8")
    })

  const rawConfig = readConfig()
  if (!rawConfig) {
    return mergeConfig({}, options.directory, options.configRoot)
  }

  try {
    return mergeConfig(JSON.parse(rawConfig) as Partial<AttachNotifyConfig>, options.directory, options.configRoot)
  } catch {
    return mergeConfig({}, options.directory, options.configRoot)
  }
}

export async function runNotifyScript(scriptPath: string, event: AttachNotifyEvent, message: string): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    const child = spawn(scriptPath, [event, message], {
      stdio: "ignore",
      detached: true,
    })

    child.on("error", () => resolvePromise())
    child.unref()
    resolvePromise()
  })
}

async function emitConfiguredEvent(
  config: AttachNotifyConfig,
  runNotify: RunNotify,
  event: AttachNotifyEvent,
): Promise<void> {
  if (!config.events[event]) {
    return
  }

  await runNotify(config.notifyScript, event, config.messages[event])
}

export async function createAttachNotifyPlugin(options: {
  directory?: string
  configRoot?: string
  clientEnv?: string | null
  readConfig?: ReadConfig
  runNotify?: RunNotify
}): Promise<HookMap> {
  const config = loadAttachNotifyConfig({
    directory: options.directory,
    configRoot: options.configRoot,
    readConfig: options.readConfig,
  })
  const clientEnv = options.clientEnv ?? process.env.OPENCODE_CLIENT ?? null
  const runNotify = options.runNotify ?? runNotifyScript

  if (clientEnv && clientEnv !== "cli" && !config.enableOnDesktop) {
    return {}
  }

  return {
    event: async ({ event }) => {
      if (event.type === "permission.asked") {
        await emitConfiguredEvent(config, runNotify, "permission")
      }

      if (event.type === "session.idle") {
        await emitConfiguredEvent(config, runNotify, "complete")
      }

      if (event.type === "session.error") {
        await emitConfiguredEvent(config, runNotify, "error")
      }
    },
    "permission.ask": async () => {
      await emitConfiguredEvent(config, runNotify, "permission")
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "question") {
        await emitConfiguredEvent(config, runNotify, "question")
      }

      if (input.tool === "plan_exit") {
        await emitConfiguredEvent(config, runNotify, "plan_exit")
      }
    },
  }
}

export function getProjectName(directory?: string): string {
  return basename(getProjectDirectory(directory))
}
