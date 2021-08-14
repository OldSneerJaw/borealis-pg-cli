import * as Heroku from '@heroku-cli/schema'
import {Command, flags} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import color from '@heroku-cli/color'
import cli from 'cli-ux'

const pgExtensionColour = color.green

export default class RemovePgExtensionCommand extends Command {
  static description = 'Remove a Postgres extension from a Borealis Isolated Postgres add-on'

  static args = [
    {name: 'PG_EXTENSION', description: 'The name of a Postgres extension', required: true},
  ]

  static flags = {
    addon: flags.string({
      char: 'o',
      description: 'The name or ID of a Borealis Isolated Postgres add-on',
      required: true,
    }),
  }

  async run() {
    const {args, flags} = this.parse(RemovePgExtensionCommand)
    const addonName = flags.addon
    const pgExtension = args.PG_EXTENSION
    const authResponse = await this.heroku.post<Heroku.OAuthAuthorization>(
      '/oauth/authorizations',
      {
        body: {
          description: 'Borealis PG CLI plugin temporary auth token',
          expires_in: 120,
          scope: ['read'],
        },
      })

    try {
      const accessTokenInfo = authResponse.body.access_token
      if (!accessTokenInfo) {
        this.error('Log in to the Heroku CLI first!')
      } else {
        cli.action.start(
          `Removing Postgres extension ${pgExtensionColour(pgExtension)} from add-on ${color.addon(addonName)}`)

        await HTTP.delete(
          `https://pg-heroku-addon-api.borealis-data.com/heroku/resources/${addonName}/pg-extensions/${pgExtension}`,
          {headers: {Authorization: `Bearer ${accessTokenInfo.token}`}})

        cli.action.stop()
      }
    } finally {
      await this.heroku.delete<Heroku.OAuthAuthorization>(
        `/oauth/authorizations/${authResponse.body.id}`)
    }
  }

  async catch(err: any) {
    const {flags} = this.parse(RemovePgExtensionCommand)
    const addonName = flags.addon

    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error(err.body.reason)
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
