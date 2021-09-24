import color from '@heroku-cli/color'
import {flags} from '@heroku-cli/command'
import {AddOnAttachment} from '@heroku-cli/schema'

export const consoleColours = {
  cliFlagName: color.bold.italic,
  pgExtension: color.green,
}

export const localPgHostname = 'localhost'

export const defaultPorts = {
  pg: 5432,
  ssh: 22,
}

export const cliArgs = {
  pgExtension: {name: 'PG_EXTENSION', description: 'name of a Postgres extension', required: true},
}

export const cliFlags = {
  addon: flags.string({
    char: 'o',
    description: 'name or ID of an add-on or one of its attachments',
    required: true,
  }),
  app: flags.app({
    description: 'app to which the add-on is attached',
  }),
  port: flags.integer({
    char: 'p',
    default: defaultPorts.pg,
    description: 'local port number for the secure tunnel to the add-on Postgres server',
    parse: input => {
      if (!/^-?\d+$/.test(input))
        throw new Error(`Value "${input}" is not a valid integer`)

      const value = parseInt(input, 10)
      if (value < 1 || value > 65535) {
        throw new Error(`Value ${value} is outside the range of valid port numbers`)
      }

      return value
    },
  }),
  'write-access': flags.boolean({
    char: 'w',
    default: false,
    description: 'allow write access to the add-on Postgres database',
  }),
}

/**
 * Retrieves the add-on name associated with the given attachment info list
 *
 * @param errorHandler A function to output errors when they occur
 * @param attachmentInfos A list of attachment information
 * @param addonOrAttachment The ID or name of an add-on or one of its attachments
 * @param appName The name of the app to which the add-on is attached
 *
 * @returns The add-on name
 */
export function processAddonAttachmentInfo(
  errorHandler: (message: string) => never,
  attachmentInfos: AddOnAttachment[] | null,
  addonOrAttachment: string,
  appName?: string): string | never {
  if (attachmentInfos && attachmentInfos.length > 0) {
    const [attachmentInfo] = attachmentInfos

    const addonName = attachmentInfo.addon?.name
    if (addonName) {
      return addonName
    } else {
      errorHandler('Add-on service is temporarily unavailable. Try again later.')
    }
  } else if (appName) {
    return errorHandler(
      `App ${color.app(appName)} has no ${color.addon(addonOrAttachment)} add-on attachment`)
  } else {
    return errorHandler(
      `Add-on ${color.addon(addonOrAttachment)} was not found. Consider trying again with the ` +
      `${consoleColours.cliFlagName('--app')} flag.`)
  }
}
