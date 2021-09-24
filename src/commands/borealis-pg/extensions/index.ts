import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {cliFlags, consoleColours, processAddonAttachmentInfo} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const pgExtensionColour = consoleColours.pgExtension

export default class ListPgExtensionsCommand extends Command {
  static description = 'lists installed Postgres extensions for a Borealis Isolated Postgres add-on'

  static flags = {
    addon: cliFlags.addon,
    app: cliFlags.app,
  }

  async run() {
    const {flags} = this.parse(ListPgExtensionsCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const addonName =
      processAddonAttachmentInfo(this.error, attachmentInfos, flags.addon, flags.app)
    try {
      const response = await applyActionSpinner(
        `Fetching Postgres extension list for add-on ${color.addon(addonName)}`,
        HTTP.get(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )

      const responseBody = response.body as {extensions: Array<{name: string}>}
      if (responseBody.extensions.length > 0) {
        responseBody.extensions.forEach(extension => {
          this.log(pgExtensionColour(extension.name))
        })
      } else {
        this.warn('No extensions found')
      }
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    const {flags} = this.parse(ListPgExtensionsCommand)

    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error(`Add-on ${color.addon(flags.addon)} is not a Borealis Isolated Postgres add-on`)
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
