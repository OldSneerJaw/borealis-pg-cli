import * as Heroku from '@heroku-cli/schema'
import {Command, flags} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import color from '@heroku-cli/color'
import cli from 'cli-ux'

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
          `Fetching Postgres extension list for add-on ${color.addon(addonName)}`)
        const response = await HTTP.get(
          `https://pg-heroku-addon-api.borealis-data.com/heroku/resources/${addonName}/pg-extensions`,
          {
            headers: {Authorization: `Bearer ${accessTokenInfo.token}`},
          })
        cli.action.stop()

        const responseBody = response.body as {extensions: Array<{name: string}>}
        if (responseBody.extensions.length > 0) {
          responseBody.extensions.forEach(extension => {
            this.log(pgExtensionColour(extension.name))
          })
        } else {
          this.warn('No extensions found')
        }
      }
    } finally {
      await this.heroku.delete<Heroku.OAuthAuthorization>(
        `/oauth/authorizations/${authResponse.body.id}`)
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
