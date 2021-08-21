import {Command, flags} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import color from '@heroku-cli/color'
import cli from 'cli-ux'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {createHerokuAuth, removeHerokuAuth} from '../../heroku-auth'

const pgExtensionColour = color.green

export default class ListPgExtensionsCommand extends Command {
  static description = 'List installed Postgres extensions for a Borealis Isolated Postgres add-on'

  static flags = {
    addon: flags.string({
      char: 'o',
      description: 'name or ID of a Borealis Isolated Postgres add-on',
      required: true,
    }),
  }

  async run() {
    const {flags} = this.parse(ListPgExtensionsCommand)
    const addonName = flags.addon
    const authorization = await createHerokuAuth(this.heroku)

    try {
      cli.action.start(
        `Fetching Postgres extension list for add-on ${color.addon(addonName)}`)
      const response = await HTTP.get(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
        {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
      cli.action.stop()

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
    const addonName = flags.addon

    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error(
          `Add-on ${color.addon(addonName)} was not found or is not a Borealis Isolated Postgres add-on`)
      } else if (err.statusCode === 422) {
        this.error(`Add-on ${color.addon(addonName)} is not finished provisioning`)
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}
