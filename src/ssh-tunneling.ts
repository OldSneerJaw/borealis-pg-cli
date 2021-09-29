import {Server} from 'net'
import {Client as SshClient} from 'ssh2'
import {defaultPorts, localPgHostname} from './command-components'
import tunnelServices from './tunnel-services'

/**
 * Establishes an SSH tunnel for an add-on Postgres database
 *
 * @param connInfo The connection info
 * @param logger Logging methods
 * @param readyListener The callback to execute when the tunnel is established
 *
 * @returns The SSH client
 */
export function openSshTunnel(
  connInfo: FullConnectionInfo,
  logger: Logger,
  readyListener: (sshClient: SshClient) => void): SshClient {
  const sshClient = tunnelServices.sshClientFactory.create()

  initProxyServer(sshClient, connInfo, logger)

  return initSshClient(sshClient, connInfo, logger, () => readyListener(sshClient))
}

function initProxyServer(
  sshClient: SshClient,
  connInfo: FullConnectionInfo,
  logger: Logger): Server {
  return tunnelServices.tcpServerFactory.create(tcpSocket => {
    tcpSocket.on('end', () => {
      logger.debug(`Ended session on port ${tcpSocket.remotePort}`)
    }).on('error', (socketErr: any) => {
      if (socketErr.code === 'ECONNRESET') {
        logger.debug(`Server connection reset on port ${tcpSocket.remotePort}: ${socketErr}`)
        tcpSocket.destroy()
      } else {
        logger.error(socketErr)
      }
    })

    sshClient.forwardOut(
      localPgHostname,
      connInfo.localPgPort,
      connInfo.db.dbHost,
      connInfo.db.dbPort ?? defaultPorts.pg,
      (sshErr, sshStream) => {
        if (sshErr) {
          logger.error(sshErr)
        }

        logger.debug(`Started session on port ${tcpSocket.remotePort}`)

        tcpSocket.pipe(sshStream)
        sshStream.pipe(tcpSocket)
      })
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.debug(err)

      // Do not let the error function throw an exception or it will generate an ugly stack trace
      logger.error(
        `Local port ${connInfo.localPgPort} is already in use. Specify a different port number with the --port flag.`,
        {exit: false})

      tunnelServices.nodeProcess.exit(1)
    } else {
      logger.error(err)
    }
  }).listen(connInfo.localPgPort, localPgHostname)
}

function initSshClient(
  sshClient: SshClient,
  connInfo: {ssh: SshConnectionInfo; db: DbConnectionInfo; localPgPort: number},
  logger: Logger,
  onReady: () => void): SshClient {
  const [expectedPublicSshHostKeyFormat, expectedPublicSshHostKey] =
    connInfo.ssh.publicSshHostKey.split(' ')

  sshClient.on('ready', onReady)
    .connect({
      host: connInfo.ssh.sshHost,
      port: connInfo.ssh.sshPort ?? defaultPorts.ssh,
      username: connInfo.ssh.sshUsername,
      privateKey: connInfo.ssh.sshPrivateKey,
      algorithms: {serverHostKey: [expectedPublicSshHostKeyFormat]},
      hostVerifier: (keyHash: any) => {
        const keyHashStr =
          (keyHash instanceof Buffer) ? keyHash.toString('base64') : keyHash.toString()

        logger.debug(`Actual SSH host key: ${keyHashStr}`)
        logger.debug(`Expected SSH host key: ${expectedPublicSshHostKey}`)

        return keyHashStr === expectedPublicSshHostKey
      },
    })

  return sshClient
}

export interface SshConnectionInfo {
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey: string;
  publicSshHostKey: string;
}

export interface DbConnectionInfo {
  dbHost: string;
  dbPort?: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
}

interface FullConnectionInfo {
  db: DbConnectionInfo;
  ssh: SshConnectionInfo;
  localPgPort: number;
}

interface Logger {
  debug: (...args: any[]) => void;
  info: (message?: string | undefined, ...args: any[]) => void;
  warn: (input: string | Error) => void;
  error: (input: string | Error, options?: {[name: string]: any}) => never | void;
}
