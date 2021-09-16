import color from '@heroku-cli/color'
import {Command, flags} from '@heroku-cli/command'
import cli from 'cli-ux'
import {HTTP, HTTPError} from 'http-call'
import {Server} from 'net'
import {Client as SshClient} from 'ssh2'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../borealis-api'
import {createHerokuAuth, removeHerokuAuth} from '../../heroku-auth'
import tunnelServices from '../../tunnel-services'

const localPgHostname = 'localhost'
const sshPort = 22
const pgPort = 5432

const keyboardKeyColour = color.italic
const connKeyColour = color.bold
const connValueColour = color.grey

const portNumberFlag = flags.build({
  parse: input => {
    if (!/^-?\d+$/.test(input))
      throw new Error(`Value "${input}" is not a valid integer`)

    const value = parseInt(input, 10)
    if (value < 1 || value > 65535) {
      throw new Error(`Value ${value} is outside the range of valid port numbers`)
    }

    return value
  },
})

export default class TunnelCommand extends Command {
  static description =
    'establishes a secure tunnel to a Borealis Isolated Postgres add-on\n' +
    '\n' +
    'This command allows for local, temporary connections to an add-on Postgres\n' +
    'database that is, by design, otherwise inaccessible from outside of its\n' +
    'virtual private cloud. Once a tunnel is established, use a tool such as psql or\n' +
    'pgAdmin to interact with the add-on database.'

  static flags = {
    addon: flags.string({
      char: 'o',
      description: 'name or ID of a Borealis Isolated Postgres add-on',
      required: true,
    }),
    port: portNumberFlag({
      char: 'p',
      default: pgPort,
      description: 'local port number for the secure tunnel to the add-on Postgres server',
    }),
    'write-access': flags.boolean({
      char: 'w',
      default: false,
      description: 'allow write access to the Postgres database',
    }),
  }

  async run() {
    const {flags} = this.parse(TunnelCommand)

    const [sshConnInfo, dbConnInfo] =
      await this.createAdhocUsers(flags.addon, flags['write-access'])

    const sshClient = this.openSshTunnel(sshConnInfo, dbConnInfo, flags.port)

    tunnelServices.nodeProcess.on('SIGINT', _ => {
      sshClient.end()
      tunnelServices.nodeProcess.exit(0)
    })
  }

  private async createAdhocUsers(
    addonName: string,
    enableWriteAccess: boolean): Promise<any[]> {
    const authorization = await createHerokuAuth(this.heroku, true)
    try {
      cli.action.start(`Configuring temporary user for add-on ${color.addon(addonName)}`)

      const sshConnInfoPromise: Promise<HTTP<AdHocSshConnectionInfo>> = HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/adhoc-ssh-users`),
        {headers: {Authorization: getBorealisPgAuthHeader(authorization)}})
      const dbConnInfoPromise: Promise<HTTP<AdHocDbConnectionInfo>> = HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/adhoc-db-users`),
        {
          headers: {Authorization: getBorealisPgAuthHeader(authorization)},
          body: {enableWriteAccess},
        })

      const [sshConnInfoResponse, dbConnInfoResponse] =
        await Promise.all([sshConnInfoPromise, dbConnInfoPromise])

      cli.action.stop()

      return [sshConnInfoResponse.body, dbConnInfoResponse.body]
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private openSshTunnel(
    sshConnInfo: AdHocSshConnectionInfo,
    dbConnInfo: AdHocDbConnectionInfo,
    localPgPort: number): SshClient {
    const sshClient = tunnelServices.sshClientFactory.create()

    this.initProxyServer(dbConnInfo, localPgPort, sshClient)

    return this.initSshClient(sshClient, sshConnInfo, dbConnInfo, localPgPort)
  }

  private initProxyServer(
    dbConnInfo: AdHocDbConnectionInfo,
    localPgPort: number,
    sshClient: SshClient,
  ): Server {
    return tunnelServices.tcpServerFactory.create(tcpSocket => {
      tcpSocket.on('end', () => {
        this.debug(`Ended session on port ${tcpSocket.remotePort}`)
      }).on('error', (socketErr: any) => {
        if (socketErr.code === 'ECONNRESET') {
          this.debug(`Server connection reset on port ${tcpSocket.remotePort}: ${socketErr}`)
          tcpSocket.destroy()
        } else {
          this.error(socketErr)
        }
      })

      sshClient.forwardOut(
        localPgHostname,
        localPgPort,
        dbConnInfo.dbHost,
        dbConnInfo.dbPort ?? pgPort,
        (sshErr, sshStream) => {
          if (sshErr) {
            this.error(sshErr)
          }

          this.debug(`Started session on port ${tcpSocket.remotePort}`)

          tcpSocket.pipe(sshStream)
          sshStream.pipe(tcpSocket)
        })
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        this.debug(err)

        // Use console.error instead of this.error since this code is executed asynchronously and
        // this.error would output a stack trace in this case
        console.error(
          ` ${color.red('›')}   Error: Local port ${localPgPort} is already in use. ` +
          'Specify a different port number with the --port flag.')
        tunnelServices.nodeProcess.exit(1)
      } else {
        this.error(err)
      }
    }).listen(localPgPort, localPgHostname)
  }

  private initSshClient(
    sshClient: SshClient,
    sshConnInfo: AdHocSshConnectionInfo,
    dbConnInfo: AdHocDbConnectionInfo,
    localPgPort: number): SshClient {
    const dbUrl =
      `postgres://${dbConnInfo.dbUsername}:${dbConnInfo.dbPassword}` +
      `@${localPgHostname}:${localPgPort}/${dbConnInfo.dbName}`
    const [expectedPublicSshHostKeyFormat, expectedPublicSshHostKey] =
      sshConnInfo.publicSshHostKey.split(' ')

    sshClient.on('ready', () => {
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
        `Press ${keyboardKeyColour('Ctrl')}+${keyboardKeyColour('C')} to close the tunnel and exit`)
    }).connect({
      host: sshConnInfo.sshHost,
      port: sshConnInfo.sshPort ?? sshPort,
      username: sshConnInfo.sshUsername,
      privateKey: sshConnInfo.sshPrivateKey,
      algorithms: {serverHostKey: [expectedPublicSshHostKeyFormat]},
      hostVerifier: (keyHash: any) => {
        const keyHashStr =
          (keyHash instanceof Buffer) ? keyHash.toString('base64') : keyHash.toString()

        this.debug(`Actual SSH host key: ${keyHashStr}`)
        this.debug(`Expected SSH host key: ${expectedPublicSshHostKey}`)

        return keyHashStr === expectedPublicSshHostKey
      },
    })

    return sshClient
  }

  async catch(err: any) {
    const {flags} = this.parse(TunnelCommand)

    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error(
          `Add-on ${color.addon(flags.addon)} was not found or is not a Borealis Isolated Postgres add-on`)
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

interface AdHocSshConnectionInfo {
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey: string;
  publicSshHostKey: string;
}

interface AdHocDbConnectionInfo {
  dbHost: string;
  dbPort?: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
}
