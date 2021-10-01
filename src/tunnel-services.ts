import childProcess, {SpawnOptions} from 'child_process'
import {createServer, Socket} from 'net'
import {Client as PgClient, ClientConfig as PgClientConfig} from 'pg'
import {Client as SshClient} from 'ssh2'

/**
 * The service factories to be used when tunneling
 *
 * Since oclif doesn't support dependency injection for commands, this is the next best thing.
 */
export default {
  childProcessFactory: {
    spawn: (command: string, options: SpawnOptions) => childProcess.spawn(command, options),
  },
  nodeProcess: process,
  pgClientFactory: {create: (config: PgClientConfig) => new PgClient(config)},
  sshClientFactory: {create: () => new SshClient()},
  tcpServerFactory: {
    create: (connectionListener: (socket: Socket) => void) => createServer(connectionListener),
  },
}
