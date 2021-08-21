import {Command, flags} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import color from '@heroku-cli/color'
import cli from 'cli-ux'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {createHerokuAuth, removeHerokuAuth} from '../../../heroku-auth'

const pgExtensionColour = color.green

export default class InstallPgExtensionsCommand extends Command {
  static description = 'Install a Postgres extension for a Borealis Isolated Postgres add-on'

  static args = [
    {name: 'PG_EXTENSION', description: 'name of a Postgres extension', required: true},
  ]

  static flags = {
    addon: flags.string({
      char: 'o',
      description: 'name or ID of a Borealis Isolated Postgres add-on',
      required: true,
    }),
  }

  async run() {
    const {args, flags} = this.parse(InstallPgExtensionsCommand)
    const addonName = flags.addon
    const pgExtension = args.PG_EXTENSION
    const authorization = await createHerokuAuth(this.heroku)

    try {
      cli.action.start(
        `Installing Postgres extension ${pgExtensionColour(pgExtension)} for add-on ${color.addon(addonName)}`)

      await HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
        {
          headers: {Authorization: getBorealisPgAuthHeader(authorization)},
          body: {pgExtensionName: pgExtension},
        })

      cli.action.stop()
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    const {args, flags} = this.parse(InstallPgExtensionsCommand)
    const addonName = flags.addon
    const pgExtension = args.PG_EXTENSION

    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        this.error(`${pgExtensionColour(pgExtension)} is not a supported Postgres extension`)
      } else if (err.statusCode === 404) {
        this.error(
          `Add-on ${color.addon(addonName)} was not found or is not a Borealis Isolated Postgres add-on`)
      } else if (err.statusCode === 409) {
        this.error(`Postgres extension ${pgExtensionColour(pgExtension)} is already installed`)
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
