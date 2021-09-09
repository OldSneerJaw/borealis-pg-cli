import {Command, flags} from '@heroku-cli/command'
import {OAuthAuthorization} from '@heroku-cli/schema'
import {HTTP, HTTPError} from 'http-call'
import color from '@heroku-cli/color'
import cli from 'cli-ux'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {createHerokuAuth, removeHerokuAuth} from '../../../heroku-auth'

const cliFlagColour = color.bold.italic
const pgExtensionColour = color.green
const schemaColour = color.grey

export default class InstallPgExtensionsCommand extends Command {
  static description =
    'installs a Postgres extension on a Borealis Isolated Postgres add-on\n' +
    '\n' +
    'If the extension has any unsatisfied dependencies, those Postgres extensions\n' +
    'will also be installed automatically. Each extension is typically installed\n' +
    'with its own dedicated database schema, which may be used to store types,\n' +
    'functions, tables or other objects that are part of the extension.\n' +
    '\n' +
    'Details of supported extensions can be found here: \n' +
    'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Extensions.html'

  static args = [
    {name: 'PG_EXTENSION', description: 'name of a Postgres extension', required: true},
  ]

  static flags = {
    addon: flags.string({
      char: 'o',
      description: 'name or ID of a Borealis Isolated Postgres add-on',
      required: true,
    }),
    recursive: flags.boolean({
      char: 'r',
      default: false,
      description: 'automatically install Postgres extension dependencies recursively',
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

      const extSchemas = await this.installExtension(
        addonName,
        pgExtension,
        authorization,
        flags.recursive)

      cli.action.stop()

      this.log('Database schemas for installed extensions:')
      extSchemas.forEach(extSchema => {
        this.log(`- ${pgExtensionColour(extSchema.extension)}: ${schemaColour(extSchema.schema)}`)
      })
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async installExtension(
    addonName: string,
    pgExtension: string,
    authorization: OAuthAuthorization,
    recursive: boolean): Promise<PgExtensionDetails[]> {
    try {
      const response: HTTP<{pgExtensionSchema: string}> = await HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/pg-extensions`),
        {
          headers: {Authorization: getBorealisPgAuthHeader(authorization)},
          body: {pgExtensionName: pgExtension},
        })

      return [{extension: pgExtension, schema: response.body.pgExtensionSchema}]
    } catch (error) {
      if (error instanceof HTTPError &&
        error.statusCode === 400 &&
        error.body.dependencies &&
        recursive) {
        // The extension has unsatisfied dependencies
        return this.recursiveInstallation(
          addonName,
          pgExtension,
          authorization,
          error.body.dependencies)
      } else {
        throw error
      }
    }
  }

  private async recursiveInstallation(
    addonName: string,
    pgExtension: string,
    authorization: OAuthAuthorization,
    dependencies: string[]): Promise<PgExtensionDetails[]> {
    const dependencyResults = await Promise.all(dependencies.map(
      async (dependency: string) => {
        try {
          return await this.installExtension(addonName, dependency, authorization, true)
        } catch (error) {
          if (error instanceof HTTPError && error.statusCode === 409) {
            // This particular dependency is already installed
            return []
          } else {
            throw error
          }
        }
      }))

    // Retry now that the dependencies are installed
    const retryResults = await this.installExtension(
      addonName,
      pgExtension,
      authorization,
      false)

    return [...retryResults, ...dependencyResults.flat()]
  }

  async catch(err: any) {
    const {args, flags} = this.parse(InstallPgExtensionsCommand)
    const addonName = flags.addon
    const pgExtension = args.PG_EXTENSION

    if (err instanceof HTTPError) {
      if (err.statusCode === 400) {
        if (err.body.dependencies) {
          const dependencies: string[] = err.body.dependencies
          const dependenciesString =
            dependencies.map(dependency => pgExtensionColour(dependency)).join(', ')
          this.error(
            `Extension ${pgExtensionColour(pgExtension)} has one or more unsatisfied ` +
            `dependencies. All of its dependencies (${dependenciesString}) must be installed.\n` +
            `Run this command again with the ${cliFlagColour('--recursive')} flag to ` +
            'automatically and recursively install the extension and the missing extension(s) it ' +
            'depends on.')
        } else {
          this.error(`${pgExtensionColour(pgExtension)} is not a supported Postgres extension`)
        }
      } else if (err.statusCode === 404) {
        this.error(
          `Add-on ${color.addon(addonName)} was not found or is not a Borealis Isolated Postgres ` +
          'add-on')
      } else if (err.statusCode === 409) {
        this.error(
          `Extension ${pgExtensionColour(pgExtension)} is already installed or there is a schema ` +
          'name conflict with an existing database schema')
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

interface PgExtensionDetails {
  extension: string;
  schema: string;
}
