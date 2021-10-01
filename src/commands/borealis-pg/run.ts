import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {ConfigVars} from '@heroku-cli/schema'
import {cli} from 'cli-ux'
import {HTTP, HTTPError} from 'http-call'
import {QueryResult} from 'pg'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {
  cliFlags,
  consoleColours,
  defaultPorts,
  localPgHostname,
  processAddonAttachmentInfo,
} from '../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../heroku-api'
import {
  DbConnectionInfo,
  FullConnectionInfo,
  openSshTunnel,
  SshConnectionInfo,
} from '../../ssh-tunneling'
import tunnelServices from '../../tunnel-services'

const defaultOutputFormat = 'table'

export default class RunCommand extends Command {
  static description =
    `runs a noninteractive command with a secure tunnel to a Borealis Isolated Postgres add-on

A command can take the form of a database command or a shell command. In either
case, it is executed using the Heroku application's dedicated database user by
default, but it can be made to execute as a database user that is specifically
tied to the current Heroku user account via the ${consoleColours.cliFlagName('--personal-user')} flag instead.
Note that any tables, indexes, views or other objects that are created when
connected as a personal user will be owned by that user rather than the
application database user unless ownership is explicitly reassigned.

Database commands are raw statements (e.g. SQL, PL/pgSQL) that are sent over
the secure tunnel to the add-on Postgres database to be executed verbatim with
the results then written to the console on stdout.

Shell commands are useful for executing an application's database migration
scripts or other unattended database scripts. They are executed in a shell on
the local machine with the following environment variables automatically set to
allow scripts and applications that are launched by the command to connect over
the secure tunnel to the remote add-on Postgres database:
    - ${consoleColours.envVar('PGHOST')}
    - ${consoleColours.envVar('PGPORT')}
    - ${consoleColours.envVar('PGDATABASE')}
    - ${consoleColours.envVar('PGUSER')}
    - ${consoleColours.envVar('PGPASSWORD')}
    - ${consoleColours.envVar('DATABASE_URL')}`

  static flags = {
    addon: cliFlags.addon,
    app: cliFlags.app,
    'personal-user': flags.boolean({
      char: 'u',
      description: 'run as a personal user rather than a user belonging to the Heroku application',
      default: false,
    }),
    'db-command': flags.string({
      char: 'd',
      description: 'database command to execute when the secure tunnel is established',
      exclusive: ['shell-command'],
    }),
    format: flags.enum({
      char: 'f',
      dependsOn: ['db-command'],
      description: `[default: ${defaultOutputFormat}] output format for database command results`,
      exclusive: ['shell-command'],
      options: [defaultOutputFormat, 'csv', 'json', 'yaml'],
    }),
    port: cliFlags.port,
    'shell-command': flags.string({
      char: 'e',
      description: 'shell command to execute when the secure tunnel is established',
      exclusive: ['db-command', 'format'],
    }),
    'write-access': cliFlags['write-access'],
  }

  async run() {
    const {flags} = this.parse(RunCommand)
    const dbCommand = flags['db-command']
    const shellCommand = flags['shell-command']

    if ((typeof dbCommand === 'undefined') && (typeof shellCommand === 'undefined')) {
      this.error(
        `Either ${consoleColours.cliFlagName('--db-command')} or ` +
        `${consoleColours.cliFlagName('--shell-command')} must be specified`)
    }

    const normalizedOutputFormat =
      (flags.format === defaultOutputFormat) ? undefined : flags.format

    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const addonInfo = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)

    const [sshConnInfo, dbConnInfo] = await this.prepareUsers(
      addonInfo,
      flags['personal-user'],
      flags['write-access'],
      typeof normalizedOutputFormat === 'undefined')
    const fullConnInfo = {ssh: sshConnInfo, db: dbConnInfo, localPgPort: flags.port}

    if (dbCommand) {
      this.executeDbCommand(fullConnInfo, dbCommand, normalizedOutputFormat)
    } else {
      this.executeShellCommand(fullConnInfo, shellCommand as string)
    }
  }

  private async prepareUsers(
    addonInfo: {addonName: string; appName: string; attachmentName: string},
    usePersonalUser: boolean,
    enableWriteAccess: boolean,
    showSpinner: boolean): Promise<any[]> {
    const authorization = await createHerokuAuth(this.heroku, true)
    try {
      const dbConnInfoPromise =
        !usePersonalUser ?
          this.fetchAppDbConnInfo(addonInfo.appName, addonInfo.attachmentName, enableWriteAccess) :
          HTTP
            .post<DbConnectionInfo>(
              getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-db-users`),
              {
                headers: {Authorization: getBorealisPgAuthHeader(authorization)},
                body: {enableWriteAccess},
              })
            .then(value => value.body)

      const fullConnInfoPromise = Promise.allSettled([
        HTTP
          .post<SshConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-ssh-users`),
            {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
          .then(value => value.body),
        dbConnInfoPromise,
      ])

      const [sshConnInfoResult, dbConnInfoResult] =
        !showSpinner ?
          await fullConnInfoPromise :
          await applyActionSpinner(
            `Configuring user session for add-on ${color.addon(addonInfo.addonName)}`,
            fullConnInfoPromise,
          )

      if (sshConnInfoResult.status === 'rejected') {
        throw sshConnInfoResult.reason
      } else if (dbConnInfoResult.status === 'rejected') {
        throw dbConnInfoResult.reason
      }

      return [sshConnInfoResult.value, dbConnInfoResult.value]
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private async fetchAppDbConnInfo(
    appName: string,
    attachmentName: string,
    enableWriteAccess: boolean): Promise<DbConnectionInfo> {
    const appConnInfoConfigVarName = `${attachmentName}_SSH_TUNNEL_BPG_CONNECTION_INFO`
    const configVarsInfo = await this.heroku.get<ConfigVars>(`/apps/${appName}/config-vars`)
    const appConnInfo = configVarsInfo.body[appConnInfoConfigVarName]

    const dbHostVar = enableWriteAccess ? 'POSTGRES_WRITER_HOST' : 'POSTGRES_READER_HOST'
    const dbHostPattern = new RegExp(`${dbHostVar}:=([^|]+)`)
    const dbHostMatch = appConnInfo.match(dbHostPattern)

    const dbPortPattern = /POSTGRES_PORT:=(\d+)/
    const dbPortMatch = appConnInfo.match(dbPortPattern)
    const dbPort = dbPortMatch ? Number.parseInt(dbPortMatch[1], 10) : defaultPorts.pg

    const dbNamePattern = /POSTGRES_DB_NAME:=([^|]+)/
    const dbNameMatch = appConnInfo.match(dbNamePattern)

    const dbUsernameVar =
      enableWriteAccess ? 'POSTGRES_WRITER_USERNAME' : 'POSTGRES_READER_USERNAME'
    const dbUsernamePattern = new RegExp(`${dbUsernameVar}:=([^|]+)`)
    const dbUsernameMatch = appConnInfo.match(dbUsernamePattern)

    const dbPasswordVar =
      enableWriteAccess ? 'POSTGRES_WRITER_PASSWORD' : 'POSTGRES_READER_PASSWORD'
    const dbPasswordPattern = new RegExp(`${dbPasswordVar}:=([^|]+)`)
    const dbPasswordMatch = appConnInfo.match(dbPasswordPattern)

    if (dbHostMatch && dbNameMatch && dbUsernameMatch && dbPasswordMatch) {
      return {
        dbHost: dbHostMatch[1],
        dbPort,
        dbName: dbNameMatch[1],
        dbUsername: dbUsernameMatch[1],
        dbPassword: dbPasswordMatch[1],
      }
    } else {
      this.error(
        `The ${color.configVar(appConnInfoConfigVarName)} config variable value for ` +
        `${color.app(appName)} is invalid. ` +
        'This may indicate that the config variable was manually edited.')
    }
  }

  private executeDbCommand(
    connInfo: FullConnectionInfo,
    dbCommand: string,
    outputFormat?: string): void {
    openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => {
        const pgClient = tunnelServices.pgClientFactory.create({
          host: localPgHostname,
          port: connInfo.localPgPort,
          database: connInfo.db.dbName,
          user: connInfo.db.dbUsername,
          password: connInfo.db.dbPassword,
        }).on('end', () => {
          sshClient.end()
          tunnelServices.nodeProcess.exit()
        }).on('error', (err: Error) => {
          // Do not let the error function exit or it will generate an ugly stack trace
          this.error(err, {exit: false})
          tunnelServices.nodeProcess.exit(1)
        })

        pgClient.connect()

        pgClient.query(
          dbCommand,
          (err: Error | null | undefined, results: QueryResult<any> | QueryResult<any>[]) => {
            if (err) {
              // Do not let the error function exit or it will generate an ugly stack trace
              this.error(err, {exit: false})
              tunnelServices.nodeProcess.exit(1)
            } else {
              // When multiple statements are executed, the query result will be an array
              const resultInstance = Array.isArray(results) ? results[results.length - 1] : results

              if (resultInstance.fields && resultInstance.fields.length > 0) {
                const columns = resultInstance.fields.reduce(
                  (accumulator: {[name: string]: any}, field) => {
                    accumulator[field.name] = {header: field.name}

                    return accumulator
                  },
                  {})

                cli.table(
                  resultInstance.rows,
                  columns,
                  {'no-truncate': true, output: outputFormat})
              }

              if (!outputFormat) {
                // Only show the row count for the default format (undefined aka "table")
                const rowSuffix = resultInstance.rowCount === 1 ? 'row' : 'rows'
                this.log()
                this.log(`(${resultInstance.rowCount ?? 0} ${rowSuffix})`)
              }

              pgClient.end()
            }
          })
      })
  }

  private executeShellCommand(connInfo: FullConnectionInfo, shellCommand: string): void {
    openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => {
        const commandProc = tunnelServices.childProcessFactory.spawn(shellCommand, {
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: connInfo.localPgPort.toString(),
            PGDATABASE: connInfo.db.dbName,
            PGUSER: connInfo.db.dbUsername,
            PGPASSWORD: connInfo.db.dbPassword,
            DATABASE_URL:
              `postgres://${connInfo.db.dbUsername}:${connInfo.db.dbPassword}@` +
              `${localPgHostname}:${connInfo.localPgPort}/${connInfo.db.dbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null], // Disable stdin but use the defaults for stdout and stderr
        }).on('exit', (code, _) => {
          sshClient.end()
          tunnelServices.nodeProcess.exit(code ?? undefined)
        })

        if (commandProc.stdout) {
          commandProc.stdout.on('data', data => this.log(data.toString()))
        }
        if (commandProc.stderr) {
          // Do not let the error function exit or it will generate an ugly stack trace
          commandProc.stderr.on('data', data => this.error(data.toString(), {exit: false}))
        }
      })
  }

  async catch(err: any) {
    const {flags} = this.parse(RunCommand)

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
