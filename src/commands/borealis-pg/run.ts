import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import {ConfigVars} from '@heroku-cli/schema'
import {HTTP, HTTPError} from 'http-call'
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
import {DbConnectionInfo, openSshTunnel, SshConnectionInfo} from '../../ssh-tunneling'
import tunnelServices from '../../tunnel-services'

export default class RunCommand extends Command {
  static description =
    'runs a noninteractive command with a secure tunnel to a Borealis Isolated Postgres add-on\n' +
    '\n' +
    'The command is executed as the Heroku application database user by default, but\n' +
    'it can be made to execute as a database user that is specifically tied to the\n' +
    `current Heroku user via the ${consoleColours.cliFlagName('--personal-user')} flag instead. Note that any tables,\n` +
    'indexes, views, etc. created when connected as a personal user will be owned by\n' +
    'that user rather than the application database user unless ownership is\n' +
    'explicitly reassigned.\n' +
    '\n' +
    'Shell commands are executed in a shell on the local machine with the following\n' +
    'environment variables automatically set to allow connections over the secure\n' +
    'tunnel to the remote add-on Postgres database:\n' +
    `- ${consoleColours.envVar('PGHOST')}\n` +
    `- ${consoleColours.envVar('PGPORT')}\n` +
    `- ${consoleColours.envVar('PGDATABASE')}\n` +
    `- ${consoleColours.envVar('PGUSER')}\n` +
    `- ${consoleColours.envVar('PGPASSWORD')}\n` +
    `- ${consoleColours.envVar('DATABASE_URL')}`

  static flags = {
    addon: cliFlags.addon,
    app: cliFlags.app,
    'personal-user': flags.boolean({
      char: 'u',
      description: 'run as a personal user rather than a user belonging to the Heroku application',
      default: false,
    }),
    port: cliFlags.port,
    'shell-command': flags.string({
      char: 'e',
      description: 'shell command to execute when the secure tunnel is established',
      required: true,
    }),
    'write-access': cliFlags['write-access'],
  }

  async run() {
    const {flags} = this.parse(RunCommand)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const addonInfo = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)

    const [sshConnInfo, dbConnInfo] =
      await this.prepareUsers(addonInfo, flags['personal-user'], flags['write-access'])

    this.executeShellCommand(
      sshConnInfo,
      dbConnInfo,
      flags.port,
      flags['shell-command'])
  }

  private async prepareUsers(
    addonInfo: {addonName: string; appName: string; attachmentName: string},
    usePersonalUser: boolean,
    enableWriteAccess: boolean): Promise<any[]> {
    const authorization = await createHerokuAuth(this.heroku, true)
    try {
      const dbConnInfoPromise = !usePersonalUser ?
        this.fetchAppDbConnInfo(addonInfo.appName, addonInfo.attachmentName, enableWriteAccess) :
        HTTP
          .post<DbConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-db-users`),
            {
              headers: {Authorization: getBorealisPgAuthHeader(authorization)},
              body: {enableWriteAccess},
            })
          .then(value => value.body)

      const [sshConnInfoResult, dbConnInfoResult] = await applyActionSpinner(
        `Configuring user session for add-on ${color.addon(addonInfo.addonName)}`,
        Promise.allSettled([
          HTTP
            .post<SshConnectionInfo>(
              getBorealisPgApiUrl(`/heroku/resources/${addonInfo.addonName}/personal-ssh-users`),
              {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
            .then(value => value.body),
          dbConnInfoPromise,
        ]),
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

  private executeShellCommand(
    sshConnInfo: SshConnectionInfo,
    dbConnInfo: DbConnectionInfo,
    localPgPort: number,
    shellCommand: string): void {
    openSshTunnel(
      {ssh: sshConnInfo, db: dbConnInfo, localPgPort: localPgPort},
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      sshClient => {
        const commandProc = tunnelServices.childProcessFactory.spawn(shellCommand, {
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: localPgPort.toString(),
            PGDATABASE: dbConnInfo.dbName,
            PGUSER: dbConnInfo.dbUsername,
            PGPASSWORD: dbConnInfo.dbPassword,
            DATABASE_URL:
              `postgres://${dbConnInfo.dbUsername}:${dbConnInfo.dbPassword}@` +
              `${localPgHostname}:${localPgPort}/${dbConnInfo.dbName}`,
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
