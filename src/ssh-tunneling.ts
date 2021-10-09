import {Server, Socket} from 'net'
import {Client as SshClient} from 'ssh2'
import {defaultPorts, formatCliFlagName, localPgHostname, portFlagName} from './command-components'
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

  const proxyCleanup = initProxyServers(sshClient, connInfo, logger)

  return initSshClient(
    sshClient,
    connInfo,
    logger,
    {
      onClose: proxyCleanup,
      onEnd: proxyCleanup,
      onError: proxyCleanup,
      onReady: () => readyListener(sshClient),
    })
}

function initProxyServers(
  sshClient: SshClient,
  connInfo: FullConnectionInfo,
  logger: Logger): () => void {
  const allProxySockets: Socket[] = []

  // Always forward TCP connections
  const tcpProxyServer = createProxyServer(sshClient, connInfo, logger, allProxySockets)
    .listen(connInfo.localPgPort, localPgHostname)

  // Forward Postgres Unix domain socket (IPC) connections only on non-Windows platforms:
  // - https://www.postgresql.org/docs/current/runtime-config-connection.html#GUC-UNIX-SOCKET-DIRECTORIES
  // - https://www.postgresql.org/docs/current/supported-platforms.html
  // - https://nodejs.org/api/net.html#net_ipc_support
  const ipcProxyServer = (tunnelServices.nodeProcess.platform === 'win32') ?
    null :
    createProxyServer(sshClient, connInfo, logger, allProxySockets)
      .listen(`/tmp/.s.PGSQL.${connInfo.localPgPort}`)

  const proxyServerCleanup = () => {
    tcpProxyServer.close()
    if (ipcProxyServer) {
      ipcProxyServer.close()
    }

    allProxySockets.forEach(proxySocket => {
      proxySocket.destroy()
    })
  }

  return proxyServerCleanup
}

function createProxyServer(
  sshClient: SshClient,
  connInfo: FullConnectionInfo,
  logger: Logger,
  allProxySockets: Socket[]): Server {
  return tunnelServices.tcpServerFactory
    .create(proxySocket => {
      allProxySockets.push(proxySocket)

      proxySocket.on('end', () => {
        logger.debug(`Ended session on port ${proxySocket.remotePort}`)
      }).on('error', (socketErr: any) => {
        if (socketErr.code === 'ECONNRESET') {
          logger.debug(`Server connection reset on port ${proxySocket.remotePort}: ${socketErr}`)
          proxySocket.destroy()
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

          logger.debug(`Started session on port ${proxySocket.remotePort}`)

          proxySocket.pipe(sshStream)
          sshStream.pipe(proxySocket)
        })
    })
    .on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.debug(err)

        // Do not let the error function exit or it will generate an ugly stack trace
        logger.error(
          `Local port ${connInfo.localPgPort} is already in use. ` +
          `Specify a different port number with the ${formatCliFlagName(portFlagName)} flag.`,
          {exit: false})

        tunnelServices.nodeProcess.exit(1)
      } else {
        logger.error(err)
      }
    })
}

function initSshClient(
  sshClient: SshClient,
  connInfo: {ssh: SshConnectionInfo; db: DbConnectionInfo; localPgPort: number},
  logger: Logger,
  eventListeners: {
    onClose: () => void;
    onEnd: () => void;
    onError: () => void;
    onReady: () => void;
  }): SshClient {
  const [expectedPublicSshHostKeyFormat, expectedPublicSshHostKey] =
    connInfo.ssh.publicSshHostKey.split(' ')

  sshClient.on('ready', eventListeners.onReady)
    .on('close', eventListeners.onClose)
    .on('end', eventListeners.onEnd)
    .on('error', eventListeners.onError)
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

export interface FullConnectionInfo {
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
