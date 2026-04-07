import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createAttachNotifyPlugin } from "../../lib/attach-notify-plugin"

const pluginFilePath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(pluginFilePath), "../..")

export const AttachNotifyPlugin = async ({ directory }: { directory?: string }) => {
  return createAttachNotifyPlugin({ directory, configRoot: repoRoot })
}

export default AttachNotifyPlugin
