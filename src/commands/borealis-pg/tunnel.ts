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
    'This command allows for local, temporary connections to add-on Postgres\n' +
    'databases that are, by design, otherwise inaccessible from outside of their\n' +
    'respective virtual private clouds. Once a tunnel is established, use a tool\n' +
    'such as psql or pgAdmin to interact with the add-on database.'

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

    const connectionInfo = await this.createAdhocUser(flags.addon, flags['write-access'])

    const sshClient = this.openSshTunnel(connectionInfo, flags.port)

    tunnelServices.nodeProcess.on('SIGINT', _ => {
      sshClient.end()
      tunnelServices.nodeProcess.exit(0)
    })
  }

  private async createAdhocUser(
    addonName: string,
    enableWriteAccess: boolean): Promise<AdHocConnectionInfo> {
    const authorization = await createHerokuAuth(this.heroku, true)

    try {
      cli.action.start(`Configuring temporary user for add-on ${color.addon(addonName)}`)

      const adhocUser: HTTP<AdHocConnectionInfo> = await HTTP.post(
        getBorealisPgApiUrl(`/heroku/resources/${addonName}/adhoc-users`),
        {
          headers: {Authorization: getBorealisPgAuthHeader(authorization)},
          body: {enableWriteAccess},
        })

      cli.action.stop()

      return adhocUser.body
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  private openSshTunnel(connectionInfo: AdHocConnectionInfo, localPgPort: number): SshClient {
    const sshClient = tunnelServices.sshClientFactory.create()

    this.initProxyServer(connectionInfo, localPgPort, sshClient)

    return this.initSshClient(sshClient, connectionInfo, localPgPort)
  }

  private initProxyServer(
    connectionInfo: AdHocConnectionInfo,
    localPgPort: number,
    sshClient: SshClient,
  ): Server {
    return tunnelServices.tcpServerFactory.create(tcpSocket => {
      sshClient.forwardOut(
        localPgHostname,
        localPgPort,
        connectionInfo.dbHost,
        connectionInfo.dbPort ?? pgPort,
        (sshErr, sshStream) => {
          if (sshErr) {
            this.error(sshErr)
          }

          tcpSocket.on('error', (socketErr: any) => {
            if (socketErr.code === 'ECONNRESET') {
              this.debug(`Server connection reset: ${socketErr}`)
              tcpSocket.destroy()
            } else {
              this.error(socketErr)
            }
          })

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
    connectionInfo: AdHocConnectionInfo,
    localPgPort: number): SshClient {
    const dbUrl =
      `postgres://${connectionInfo.dbUsername}:${connectionInfo.dbPassword}` +
      `@${localPgHostname}:${localPgPort}/${connectionInfo.dbName}`
    const [expectedPublicSshHostKeyFormat, expectedPublicSshHostKey] =
      connectionInfo.publicSshHostKey.split(' ')

    sshClient.on('ready', () => {
      this.log()
      this.log(
        'Secure tunnel established. ' +
        'Use the following values to connect to the database while the tunnel remains open:')

      // It was tempting to use cli.table for this, but it has the unfortunate side effect of
      // cutting off long values such that they are impossible to recover
      this.log(`      ${connKeyColour('Username')}: ${connValueColour(connectionInfo.dbUsername)}`)
      this.log(`      ${connKeyColour('Password')}: ${connValueColour(connectionInfo.dbPassword)}`)
      this.log(`          ${connKeyColour('Host')}: ${connValueColour(localPgHostname)}`)
      this.log(`          ${connKeyColour('Port')}: ${connValueColour(localPgPort.toString())}`)
      this.log(` ${connKeyColour('Database name')}: ${connValueColour(connectionInfo.dbName)}`)
      this.log(`           ${connKeyColour('URL')}: ${connValueColour(dbUrl)}`)

      this.log()
      this.log(`Press ${color.cyan('Ctrl')}+${color.cyan('C')} to close the tunnel and exit`)
    }).connect({
      host: connectionInfo.sshHost,
      port: connectionInfo.sshPort ?? sshPort,
      username: connectionInfo.sshUsername,
      privateKey: connectionInfo.sshPrivateKey,
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

interface AdHocConnectionInfo {
  dbHost: string;
  dbPort?: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey: string;
  publicSshHostKey: string;
}
