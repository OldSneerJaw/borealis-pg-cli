import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import cli from 'cli-ux'
import {HTTP, HTTPError} from 'http-call'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonFlagName,
  appFlagName,
  cliArgs,
  cliFlags,
  consoleColours,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const pgExtensionColour = consoleColours.pgExtension

const confirmFlagName = 'confirm'

export default class RemovePgExtensionCommand extends Command {
  static description = 'removes a Postgres extension from a Borealis Isolated Postgres add-on'

  static args = [
    cliArgs.pgExtension,
  ]

  static flags = {
    [addonFlagName]: cliFlags.addon,
    [appFlagName]: cliFlags.app,
    [confirmFlagName]: flags.string({
      char: 'c',
      description: 'bypass the prompt for confirmation by specifying the name of the extension',
    }),
  }

  async run() {
    const {args, flags} = this.parse(RemovePgExtensionCommand)
    const pgExtension = args[cliArgs.pgExtension.name]
    let confirmation: string
    if (flags.confirm) {
      confirmation = flags.confirm
    } else {
      confirmation = await cli.prompt('Enter the name of the extension to confirm its removal')
    }

    if (confirmation.trim() !== pgExtension) {
      this.error(`Invalid confirmation provided. Expected ${pgExtensionColour(pgExtension)}.`)
    }

    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const {addonName} = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)

    try {
      await applyActionSpinner(
        `Removing Postgres extension ${pgExtensionColour(pgExtension)} from add-on ${color.addon(addonName)}`,
        HTTP.delete(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions/${pgExtension}`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    const {args, flags} = this.parse(RemovePgExtensionCommand)
    const pgExtension = args[cliArgs.pgExtension.name]

    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error(
          `Extension ${pgExtensionColour(pgExtension)} still has dependent extensions. ` +
          'It can only be removed after its dependents are removed.')
      } else if (err.statusCode === 404) {
        if (err.body.resourceType === 'addon') {
          this.error(
            `Add-on ${color.addon(flags.addon)} is not a Borealis Isolated Postgres add-on`)
        } else {
          this.error(`Extension ${pgExtensionColour(pgExtension)} is not installed`)
        }
      } else if (err.statusCode === 422) {
        this.error(`Add-on ${color.addon(flags.addon)} is not finished provisioning`)
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}
