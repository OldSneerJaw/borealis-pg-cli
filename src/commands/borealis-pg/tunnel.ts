import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import {Client as SshClient} from 'ssh2'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  formatCliOptionName,
  localPgHostname,
  portOptionName,
  processAddonAttachmentInfo,
  writeAccessOptionName,
} from '../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../heroku-api'
import {
  DbConnectionInfo,
  FullConnectionInfo,
  openSshTunnel,
  SshConnectionInfo,
  tunnelServices,
} from '../../ssh-tunneling'

const keyboardKeyColour = color.italic
const connKeyColour = color.bold
const connValueColour = consoleColours.dataFieldValue

export default class TunnelCommand extends Command {
  static description = `establishes a secure tunnel to a Borealis Isolated Postgres add-on

This operation allows for a secure, temporary session connection to an add-on
Postgres database that is, by design, otherwise inaccessible from outside of
its virtual private cloud. Once a tunnel is established, use a tool such as
psql or pgAdmin and the provided user credentials to interact with the add-on
database. By default, the user credentials that are provided allow read-only
access to the add-on database; to enable read and write access, supply the
${formatCliOptionName(writeAccessOptionName)} option.

See also the ${consoleColours.cliCmdName('borealis-pg:run')} command to execute a noninteractive script or the
${consoleColours.cliCmdName('borealis-pg:psql')} command to launch an interactive psql session directly.`

  static examples = [
    `$ heroku borealis-pg:tunnel --${addonOptionName} borealis-pg-hex-12345 --${writeAccessOptionName}`,
    `$ heroku borealis-pg:tunnel --${appOptionName} sushi --${addonOptionName} DATABASE --${portOptionName} 54321`,
    `$ heroku borealis-pg:tunnel --${appOptionName} sushi --${addonOptionName} DATABASE_URL`,
  ]

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
    [portOptionName]: cliOptions.port,
    [writeAccessOptionName]: cliOptions.writeAccess,
  }

  async run() {
    const {flags} = this.parse(TunnelCommand)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const {addonName} = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)

    const [sshConnInfo, dbConnInfo] =
      await this.createPersonalUsers(addonName, flags[writeAccessOptionName])

    const sshClient = this.connect({ssh: sshConnInfo, db: dbConnInfo, localPgPort: flags.port})

    tunnelServices.nodeProcess.on('SIGINT', _ => {
      sshClient.end()
      tunnelServices.nodeProcess.exit(0)
    })
  }

  private async createPersonalUsers(
    addonName: string,
    enableWriteAccess: boolean): Promise<[SshConnectionInfo, DbConnectionInfo]> {
    const authorization = await createHerokuAuth(this.heroku)
    const accessLevelName = enableWriteAccess ? 'read/write' : 'read-only'
    try {
      const [sshConnInfoResult, dbConnInfoResult] = await applyActionSpinner(
        `Configuring ${accessLevelName} user session for add-on ${color.addon(addonName)}`,
        Promise.allSettled([
          HTTP.post<SshConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonName}/personal-ssh-users`),
            {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
          HTTP.post<DbConnectionInfo>(
            getBorealisPgApiUrl(`/heroku/resources/${addonName}/personal-db-users`),
            {
              headers: {Authorization: getBorealisPgAuthHeader(authorization)},
              body: {enableWriteAccess},
            }),
        ]),
      )

      if (sshConnInfoResult.status === 'rejected') {
        throw sshConnInfoResult.reason
      } else if (dbConnInfoResult.status === 'rejected') {
        throw dbConnInfoResult.reason
      }

      return [sshConnInfoResult.value.body, dbConnInfoResult.value.body]
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private connect(connInfo: FullConnectionInfo): SshClient {
    const localPgPort = connInfo.localPgPort
    const dbUrl =
      `postgres://${connInfo.db.dbUsername}:${connInfo.db.dbPassword}` +
      `@${localPgHostname}:${localPgPort}/${connInfo.db.dbName}`

    return openSshTunnel(
      connInfo,
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      _ => {
        this.log()
        this.log(
          'Secure tunnel established. Use the following values to connect to the database:')

        this.log(`      ${connKeyColour('Username')}: ${connValueColour(connInfo.db.dbUsername)}`)
        this.log(`      ${connKeyColour('Password')}: ${connValueColour(connInfo.db.dbPassword)}`)
        this.log(`          ${connKeyColour('Host')}: ${connValueColour(localPgHostname)}`)
        this.log(`          ${connKeyColour('Port')}: ${connValueColour(localPgPort.toString())}`)
        this.log(` ${connKeyColour('Database name')}: ${connValueColour(connInfo.db.dbName)}`)
        this.log(`           ${connKeyColour('URL')}: ${connValueColour(dbUrl)}`)

        this.log(`
This process does not accept any keyboard input and will continue to run
indefinitely. To interact with the database via a command line tool (e.g. psql)
while the tunnel remains open, start and use a new terminal session. No extra
steps are required to use a graphical user interface (e.g. pgAdmin).`)

        this.log()
        this.log(
          `Press ${keyboardKeyColour('Ctrl')}+${keyboardKeyColour('C')} ` +
          'to close the tunnel and exit')
      },
    )
  }

  async catch(err: any) {
    const {flags} = this.parse(TunnelCommand)

    if (err instanceof HTTPError) {
      if (err.statusCode === 403) {
        this.error(
          'Access to the add-on database has been temporarily revoked for personal users. ' +
          'Generally this indicates the database has persistently exceeded its storage limit. ' +
          'Try upgrading to a new add-on plan to restore access.')
      } else if (err.statusCode === 404) {
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
