import { existsSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { spawn } from "node:child_process"

export type AttachNotifyEvent = "permission" | "complete" | "error" | "question" | "plan_exit"

type HookMap = {
  event?: (input: { event: { type: string } }) => Promise<void>
  "permission.ask"?: () => Promise<void>
  "tool.execute.before"?: (input: { tool: string }) => Promise<void>
}

interface SessionClient {
  session?: {
    get?: (input: { path: { id: string } }) => Promise<{ data?: { title?: unknown } | null }>
  }
}

type ReadConfig = () => string | null
type RunNotify = (scriptPath: string, event: AttachNotifyEvent, title: string, message: string) => Promise<void>
type GetSessionTitle = (sessionID: string) => Promise<string | null>

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

export async function runNotifyScript(scriptPath: string, event: AttachNotifyEvent, title: string, message: string): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    const child = spawn(scriptPath, [event, title, message], {
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
  title: string,
): Promise<void> {
  if (!config.events[event]) {
    return
  }

  await runNotify(config.notifyScript, event, title, config.messages[event])
}

function getSessionID(source: unknown): string | null {
  const candidate = (source as { sessionID?: unknown; properties?: { sessionID?: unknown } } | null)
  if (!candidate) {
    return null
  }

  if (typeof candidate.sessionID === "string" && candidate.sessionID.length > 0) {
    return candidate.sessionID
  }

  if (typeof candidate.properties?.sessionID === "string" && candidate.properties.sessionID.length > 0) {
    return candidate.properties.sessionID
  }

  return null
}

async function resolveTitle(source: unknown, getSessionTitle: GetSessionTitle): Promise<string> {
  const sessionID = getSessionID(source)
  if (!sessionID) {
    return "OpenCode"
  }

  const sessionTitle = await getSessionTitle(sessionID)
  if (!sessionTitle) {
    return "OpenCode"
  }

  return sessionTitle
}

function createSessionTitleResolver(client?: SessionClient): GetSessionTitle {
  return async (sessionID: string) => {
    try {
      const response = await client?.session?.get?.({ path: { id: sessionID } })
      return typeof response?.data?.title === "string" && response.data.title.length > 0 ? response.data.title : null
    } catch {
      return null
    }
  }
}

export async function createAttachNotifyPlugin(options: {
  client?: SessionClient
  directory?: string
  configRoot?: string
  clientEnv?: string | null
  readConfig?: ReadConfig
  runNotify?: RunNotify
  getSessionTitle?: GetSessionTitle
}): Promise<HookMap> {
  const config = loadAttachNotifyConfig({
    directory: options.directory,
    configRoot: options.configRoot,
    readConfig: options.readConfig,
  })
  const clientEnv = options.clientEnv ?? process.env.OPENCODE_CLIENT ?? null
  const runNotify = options.runNotify ?? runNotifyScript
  const getSessionTitle = options.getSessionTitle ?? createSessionTitleResolver(options.client)

  if (clientEnv && clientEnv !== "cli" && !config.enableOnDesktop) {
    return {}
  }

  return {
    event: async ({ event }) => {
      if (event.type === "permission.asked") {
        await emitConfiguredEvent(config, runNotify, "permission", await resolveTitle(event, getSessionTitle))
      }

      if (event.type === "session.idle") {
        await emitConfiguredEvent(config, runNotify, "complete", await resolveTitle(event, getSessionTitle))
      }

      if (event.type === "session.error") {
        await emitConfiguredEvent(config, runNotify, "error", await resolveTitle(event, getSessionTitle))
      }
    },
    "permission.ask": async () => {
      await emitConfiguredEvent(config, runNotify, "permission", "OpenCode")
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "question") {
        await emitConfiguredEvent(config, runNotify, "question", await resolveTitle(input, getSessionTitle))
      }

      if (input.tool === "plan_exit") {
        await emitConfiguredEvent(config, runNotify, "plan_exit", await resolveTitle(input, getSessionTitle))
      }
    },
  }
}

export function getProjectName(directory?: string): string {
  return basename(getProjectDirectory(directory))
}
