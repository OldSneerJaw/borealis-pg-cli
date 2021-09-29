import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import {Client as SshClient} from 'ssh2'
import {applyActionSpinner} from '../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {cliFlags, localPgHostname, processAddonAttachmentInfo} from '../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../heroku-api'
import {openSshTunnel} from '../../ssh-tunneling'
import tunnelServices from '../../tunnel-services'

const keyboardKeyColour = color.italic
const connKeyColour = color.bold
const connValueColour = color.grey

export default class TunnelCommand extends Command {
  static description =
    'establishes a secure tunnel to a Borealis Isolated Postgres add-on\n' +
    '\n' +
    'This command allows for local, temporary connections to an add-on Postgres\n' +
    'database that is, by design, otherwise inaccessible from outside of its\n' +
    'virtual private cloud. Once a tunnel is established, use a tool such as psql or\n' +
    'pgAdmin to interact with the add-on database.'

  static flags = {
    addon: cliFlags.addon,
    app: cliFlags.app,
    port: cliFlags.port,
    'write-access': cliFlags['write-access'],
  }

  async run() {
    const {flags} = this.parse(TunnelCommand)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const {addonName} = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)

    const [sshConnInfo, dbConnInfo] =
      await this.createPersonalUsers(addonName, flags['write-access'])

    const sshClient = this.connect(sshConnInfo, dbConnInfo, flags.port)

    tunnelServices.nodeProcess.on('SIGINT', _ => {
      sshClient.end()
      tunnelServices.nodeProcess.exit(0)
    })
  }

  private async createPersonalUsers(
    addonName: string,
    enableWriteAccess: boolean): Promise<any[]> {
    const authorization = await createHerokuAuth(this.heroku, true)
    try {
      const [sshConnInfoResult, dbConnInfoResult] = await applyActionSpinner(
        `Configuring personal user for add-on ${color.addon(addonName)}`,
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

  private connect(
    sshConnInfo: SshConnectionInfo,
    dbConnInfo: DbConnectionInfo,
    localPgPort: number): SshClient {
    const dbUrl =
      `postgres://${dbConnInfo.dbUsername}:${dbConnInfo.dbPassword}` +
      `@${localPgHostname}:${localPgPort}/${dbConnInfo.dbName}`

    return openSshTunnel(
      {ssh: sshConnInfo, db: dbConnInfo, localPgPort: localPgPort},
      {debug: this.debug, info: this.log, warn: this.warn, error: this.error},
      _ => {
        this.log()
        this.log(
          'Secure tunnel established. ' +
          'Use the following values to connect to the database while the tunnel remains open:')

        // It was tempting to use cli.table for this, but it has the unfortunate side effect of
        // cutting off long values such that they are impossible to recover
        this.log(`      ${connKeyColour('Username')}: ${connValueColour(dbConnInfo.dbUsername)}`)
        this.log(`      ${connKeyColour('Password')}: ${connValueColour(dbConnInfo.dbPassword)}`)
        this.log(`          ${connKeyColour('Host')}: ${connValueColour(localPgHostname)}`)
        this.log(`          ${connKeyColour('Port')}: ${connValueColour(localPgPort.toString())}`)
        this.log(` ${connKeyColour('Database name')}: ${connValueColour(dbConnInfo.dbName)}`)
        this.log(`           ${connKeyColour('URL')}: ${connValueColour(dbUrl)}`)

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

interface SshConnectionInfo {
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey: string;
  publicSshHostKey: string;
}

interface DbConnectionInfo {
  dbHost: string;
  dbPort?: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
}
