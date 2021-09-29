import color from '@heroku-cli/color'
import {ChildProcess} from 'child_process'
import {Server, Socket} from 'net'
import {Client as SshClient, ClientChannel} from 'ssh2'
import internal from 'stream'
import {
  anyFunction,
  anyNumber,
  anyString,
  anything,
  capture,
  deepEqual,
  instance,
  mock,
  verify,
  when,
} from 'ts-mockito'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'
import tunnelServices from '../../tunnel-services'

const localPgHostname = 'localhost'
const defaultSshPort = 22
const customSshPort = 50022
const defaultPgPort = 5432
const customPgPort = 65432

const fakeAddonName = 'borealis-pg-my-fake-addon'
const fakeAddonAttachmentName = 'MY_COOL_DB'
const fakeHerokuAppName = 'my-fake-heroku-app'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgWriterHost = 'my-fake-pg-writer-hostname'
const fakePgReaderHost = 'my-fake-pg-reader-hostname'
const fakePgReadWriteAppUsername = 'app_rw_db_test_user'
const fakePgReadWriteAppPassword = 'my-fake-db-writer-password'
const fakePgReadonlyAppUsername = 'app_ro_db_test_user'
const fakePgReadonlyAppPassword = 'my-fake-db-reader-password'
const fakePgPersonalUsername = 'personal_db_test_user'
const fakePgPersonalPassword = 'my-fake-personal-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

const fakeAppConfigVars: {[name: string]: string} = {FOO_BAR: 'baz'}

fakeAppConfigVars[`${fakeAddonAttachmentName}_URL`] =
  `postgres://${fakePgReadWriteAppUsername}:${fakePgReadWriteAppPassword}@` +
  `${localPgHostname}:${customPgPort}/${fakePgDbName}`

fakeAppConfigVars[`${fakeAddonAttachmentName}_READONLY_URL`] =
  `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
  `${localPgHostname}:${customPgPort}/${fakePgDbName}`

fakeAppConfigVars[`${fakeAddonAttachmentName}_SSH_TUNNEL_BPG_CONNECTION_INFO`] =
  `POSTGRES_WRITER_HOST:=${fakePgWriterHost}|` +
  `POSTGRES_READER_HOST:=${fakePgReaderHost}|` +
  `POSTGRES_PORT:=${customPgPort}|` +
  `POSTGRES_DB_NAME:=${fakePgDbName}|` +
  `POSTGRES_WRITER_USERNAME:=${fakePgReadWriteAppUsername}|` +
  `POSTGRES_WRITER_PASSWORD:=${fakePgReadWriteAppPassword}|` +
  `POSTGRES_READER_USERNAME:=${fakePgReadonlyAppUsername}|` +
  `POSTGRES_READER_PASSWORD:=${fakePgReadonlyAppPassword}|` +
  'SSH_HOST:=this-ssh-hostname-should-be-ignored|' +
  'SSH_PORT:=10101|' +
  'SSH_PUBLIC_HOST_KEY:=this-ssh-host-key-should-be-ignored|' +
  'SSH_USERNAME:=this-ssh-username-should-be-ignored|' +
  'SSH_USER_PRIVATE_KEY:=this-ssh-private-key-should-be-ignored'

const fakeShellCommand = 'my-cool-shell-command'

const baseTestContext = test.stdout()
  .stderr()
  .nock(herokuApiBaseUrl, api => api
    .post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read', 'identity'],
    })
    .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
    .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
    .reply(200))

const testContextWithAppConfigVars = baseTestContext
  .nock(herokuApiBaseUrl, api => api.get(`/apps/${fakeHerokuAppName}/config-vars`)
    .reply(200, fakeAppConfigVars))

const testContextWithDefaultUsers = testContextWithAppConfigVars
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: customSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        }))

const defaultTestContext = testContextWithDefaultUsers
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {
        addon: {name: fakeAddonName},
        app: {name: fakeHerokuAppName},
        name: fakeAddonAttachmentName,
      },
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

const testContextWithAppFlag = testContextWithDefaultUsers
  .nock(herokuApiBaseUrl, api => api
    .post(
      '/actions/addon-attachments/resolve',
      {addon_attachment: fakeAddonAttachmentName, app: fakeHerokuAppName})
    .reply(200, [
      {
        addon: {name: fakeAddonName},
        app: {name: fakeHerokuAppName},
        name: fakeAddonAttachmentName,
      },
    ]))

const testContextWithWriteAccess = testContextWithAppConfigVars
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: defaultSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        }))
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
    ]))

const testContextWithPersonalUser = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: defaultSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })
      .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
      .reply(
        200,
        {
          dbHost: fakePgReaderHost,
          dbPort: customPgPort,
          dbName: fakePgDbName,
          dbUsername: fakePgPersonalUsername,
          dbPassword: fakePgPersonalPassword,
        }))
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
    ]))

describe('noninteractive run command', () => {
  let originalChildProcessFactory: typeof tunnelServices.childProcessFactory
  let originalNodeProcess: typeof tunnelServices.nodeProcess
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory

  let mockChildProcessFactoryType: typeof tunnelServices.childProcessFactory
  let mockChildProcessType: ChildProcess
  let mockChildProcessStdoutType: internal.Readable
  let mockChildProcessStderrType: internal.Readable

  let mockNodeProcessType: NodeJS.Process

  let mockTcpServerFactoryType: typeof tunnelServices.tcpServerFactory
  let mockTcpServerType: Server

  let mockSshClientFactoryType: typeof tunnelServices.sshClientFactory
  let mockSshClientType: SshClient

  let mockTcpSocketType: Socket
  let mockTcpSocketInstance: Socket

  let mockSshStreamType: ClientChannel
  let mockSshStreamInstance: ClientChannel

  beforeEach(() => {
    originalChildProcessFactory = tunnelServices.childProcessFactory
    originalNodeProcess = tunnelServices.nodeProcess
    originalTcpServerFactory = tunnelServices.tcpServerFactory
    originalSshClientFactory = tunnelServices.sshClientFactory

    mockChildProcessStdoutType = mock()
    mockChildProcessStderrType = mock()

    mockChildProcessType = mock()
    when(mockChildProcessType.stdout).thenReturn(instance(mockChildProcessStdoutType))
    when(mockChildProcessType.stderr).thenReturn(instance(mockChildProcessStderrType))
    const mockChildProcessInstance = instance(mockChildProcessType)
    when(mockChildProcessType.on(anyString(), anyFunction())).thenReturn(mockChildProcessInstance)

    mockChildProcessFactoryType = mock()
    when(mockChildProcessFactoryType.spawn(anyString(), anything()))
      .thenReturn(mockChildProcessInstance)
    tunnelServices.childProcessFactory = instance(mockChildProcessFactoryType)

    mockNodeProcessType = mock()
    const mockNodeProcessInstance = instance(mockNodeProcessType)
    mockNodeProcessInstance.env = {FOO_EXAMPLE: 'BAR'}
    tunnelServices.nodeProcess = mockNodeProcessInstance

    mockTcpServerType = mock(Server)
    const mockTcpServerInstance = instance(mockTcpServerType)
    when(mockTcpServerType.on(anyString(), anyFunction())).thenReturn(mockTcpServerInstance)
    when(mockTcpServerType.listen(anyNumber(), anyString())).thenReturn(mockTcpServerInstance)
    when(mockTcpServerType.close()).thenReturn(mockTcpServerInstance)

    mockTcpServerFactoryType = mock()
    when(mockTcpServerFactoryType.create(anyFunction())).thenReturn(mockTcpServerInstance)
    tunnelServices.tcpServerFactory = instance(mockTcpServerFactoryType)

    mockSshClientType = mock(SshClient)
    const mockSshClientInstance = instance(mockSshClientType)
    when(mockSshClientType.on(anyString(), anyFunction())).thenReturn(mockSshClientInstance)

    mockSshClientFactoryType = mock()
    when(mockSshClientFactoryType.create()).thenReturn(mockSshClientInstance)
    tunnelServices.sshClientFactory = instance(mockSshClientFactoryType)

    mockTcpSocketType = mock(Socket)
    mockTcpSocketInstance = instance(mockTcpSocketType)
    when(mockTcpSocketType.on(anyString(), anyFunction())).thenReturn(mockTcpSocketInstance)
    when(mockTcpSocketType.pipe(anything())).thenReturn(mockTcpSocketInstance)

    mockSshStreamType = mock()
    mockSshStreamInstance = instance(mockSshStreamType)
    when(mockSshStreamType.on(anyString(), anyFunction())).thenReturn(mockSshStreamInstance)
    when(mockSshStreamType.pipe(anything())).thenReturn(mockSshStreamInstance)
  })

  afterEach(() => {
    tunnelServices.childProcessFactory = originalChildProcessFactory
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  defaultTestContext
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--shell-command', fakeShellCommand])
    .it('starts the proxy server', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).once()
      verify(mockTcpServerType.on(anyString(), anyFunction())).once()
      verify(mockTcpServerType.on('error', anyFunction())).once()
      verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
      verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('connects to the SSH server', () => {
      verify(mockSshClientFactoryType.create()).once()
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      verify(mockSshClientType.on('ready', anyFunction())).once()

      verify(mockSshClientType.connect(anything())).once()
      const [connectConfig] = capture(mockSshClientType.connect).last()
      expect(connectConfig.host).to.equal(fakeSshHost)
      expect(connectConfig.port).to.equal(customSshPort)
      expect(connectConfig.username).to.equal(fakeSshUsername)
      expect(connectConfig.privateKey).to.equal(fakeSshPrivateKey)
      expect(connectConfig.algorithms).to.deep.equal({serverHostKey: [expectedSshHostKeyFormat]})

      expect(connectConfig.hostVerifier).to.exist
      const hostVerifier = connectConfig.hostVerifier as ((keyHash: unknown) => boolean)
      expect(hostVerifier(expectedSshHostKey)).to.be.true
      expect(hostVerifier('no good!')).to.be.false
    })

  defaultTestContext
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--shell-command', fakeShellCommand])
    .it('executes the shell command without a DB port flag', ctx => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        fakeShellCommand,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgReadonlyAppUsername,
            PGPASSWORD: fakePgReadonlyAppPassword,
            DATABASE_URL:
              `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null],
        }))).once()

      // Check that the child process's stdout is written to this process's stdout
      const fakeStdoutMessage = 'my-stdout-message'

      verify(mockChildProcessType.stdout).atLeast(1)
      verify(mockChildProcessStdoutType.on(anyString(), anyFunction())).once()

      const [childStdoutEvent, childStdoutListener] = capture(mockChildProcessStdoutType.on).last()
      expect(childStdoutEvent).to.equal('data')

      childStdoutListener(fakeStdoutMessage)

      expect(ctx.stdout).to.endWith(`${fakeStdoutMessage}\n`)

      // Check that the child process's stderr is written to this process's stderr
      const fakeStderrMessage = 'my-stderr-message'

      verify(mockChildProcessType.stderr).atLeast(1)
      verify(mockChildProcessStderrType.on(anyString(), anyFunction())).once()

      const [childStderrEvent, childStderrListener] = capture(mockChildProcessStderrType.on).last()
      expect(childStderrEvent).to.equal('data')

      childStderrListener(fakeStderrMessage)

      expect(ctx.stderr).to.endWith(`${fakeStderrMessage}\n`)

      // Check what happens when the child process ends with an exit code
      const fakeExitCode = 14

      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(fakeExitCode, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit(fakeExitCode))
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-p', '2345', '-e', fakeShellCommand])
    .it('executes the shell command with a custom DB port flag', () => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        fakeShellCommand,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: '2345',
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgReadonlyAppUsername,
            PGPASSWORD: fakePgReadonlyAppPassword,
            DATABASE_URL:
              `postgres://${fakePgReadonlyAppUsername}:${fakePgReadonlyAppPassword}@` +
              `${localPgHostname}:2345/${fakePgDbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null],
        }))).once()

      verify(mockChildProcessStdoutType.on('data', anyFunction())).once()
      verify(mockChildProcessStderrType.on('data', anyFunction())).once()

      // Check what happens when the child process ends without an exit code
      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(null, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit(undefined))
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('executes the shell command even when the child process has no stdout or stderr', () => {
      when(mockChildProcessType.stdout).thenReturn(null)
      when(mockChildProcessType.stderr).thenReturn(null)

      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(fakeShellCommand, anything())).once()
      verify(mockChildProcessStdoutType.on(anyString(), anyFunction())).never()
      verify(mockChildProcessStderrType.on(anyString(), anyFunction())).never()
    })

  testContextWithAppFlag
    .command([
      'borealis-pg:run',
      '-a',
      fakeHerokuAppName,
      '-o',
      fakeAddonAttachmentName,
      '-e',
      fakeShellCommand,
    ])
    .it('finds the correct add-on using its app and attachment names', ctx => {
      executeSshClientListener()

      expect(ctx.stderr).to.endWith(
        `Configuring user session for add-on ${fakeAddonName}... done\n`)
      verify(mockChildProcessFactoryType.spawn(fakeShellCommand, anything())).once()
    })

  testContextWithWriteAccess
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--write-access',
      '--shell-command',
      fakeShellCommand,
    ])
    .it('configures the DB user with write access when requested', () => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        fakeShellCommand,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgReadWriteAppUsername,
            PGPASSWORD: fakePgReadWriteAppPassword,
            DATABASE_URL:
              `postgres://${fakePgReadWriteAppUsername}:${fakePgReadWriteAppPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null],
        }))).once()
    })

  testContextWithPersonalUser
    .command([
      'borealis-pg:run',
      '--personal-user',
      '--addon',
      fakeAddonName,
      '--shell-command',
      fakeShellCommand,
    ])
    .it('uses a personal DB user when requested', () => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        fakeShellCommand,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
            DATABASE_URL:
              `postgres://${fakePgPersonalUsername}:${fakePgPersonalPassword}@` +
              `${localPgHostname}:${defaultPgPort}/${fakePgDbName}`,
          },
          shell: true,
          stdio: ['ignore', null, null],
        }))).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('starts SSH port forwarding', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgReaderHost,
        customPgPort,
        anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      portForwardListener(undefined, mockSshStreamInstance)

      verify(mockTcpSocketType.pipe(mockSshStreamInstance)).once()
      verify(mockSshStreamType.pipe(mockTcpSocketInstance)).once()

      verify(mockTcpSocketType.on(anyString(), anyFunction())).twice()
      verify(mockTcpSocketType.on('end', anyFunction())).once()
      verify(mockTcpSocketType.on('error', anyFunction())).once()
    })

  test
    .stdout()
    .stderr()
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--port',
      'port-must-be-an-integer',
      '--shell-command',
      fakeShellCommand,
    ])
    .catch('Value "port-must-be-an-integer" is not a valid integer')
    .it('rejects a --port value that is not an integer', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName, '-p', '-1', '-e', fakeShellCommand])
    .catch('Value -1 is outside the range of valid port numbers')
    .it('rejects a --port value that is less than 1', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName, '-p', '65536', '-e', fakeShellCommand])
    .catch('Value 65536 is outside the range of valid port numbers')
    .it('rejects a --port value that is greater than 65535', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test.stdout()
    .stderr()
    .nock(
      herokuApiBaseUrl,
      api => api.post('/oauth/authorizations')
        .reply(201, {id: fakeHerokuAuthId})  // The access_token field is missing
        .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
        .reply(200)
        .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
        .reply(200, [
          {
            addon: {name: fakeAddonName},
            app: {name: fakeHerokuAppName},
            name: fakeAddonAttachmentName,
          },
        ]))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:run', '-e', fakeShellCommand])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no shell command flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .do(() => when(mockSshClientFactoryType.create()).thenThrow(new Error('An error')))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch('An error')
    .it('throws an unexpected SSH client error when it occurs', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  defaultTestContext
    .command([
      'borealis-pg:run',
      '-o',
      fakeAddonName,
      '-p',
      customPgPort.toString(),
      '-e',
      fakeShellCommand,
    ])
    .it('handles a local port conflict', ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      errorListener({code: 'EADDRINUSE'})

      expect(ctx.stderr).to.contain(`Local port ${customPgPort} is already in use`)
      verify(mockNodeProcessType.exit(1)).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('handles a generic proxy server error', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      const fakeError = new Error("This isn't a real error")
      try {
        errorListener(fakeError)

        expect.fail('The error listener call should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('handles an error when starting port forwarding', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()

      const fakeError = new Error('Just testing!')
      try {
        portForwardListener(fakeError, mockSshStreamInstance)

        expect.fail('The port forward listener call should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.pipe(mockSshStreamInstance)).never()
      verify(mockSshStreamType.pipe(mockTcpSocketInstance)).never()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('handles an unexpected TCP socket error', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      const expectedCallCount = 2
      verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
      const socketListener = getTcpSocketListener('error', expectedCallCount)

      const fakeError = new Error('Foobarbaz')
      try {
        socketListener(fakeError)

        expect.fail('The socket error listener should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.destroy()).never()
    })

  testContextWithAppConfigVars
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(404, {reason: 'Add-on does not exist for a personal SSH user'}))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  testContextWithAppConfigVars
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(422, {reason: 'Add-on is not ready for a personal SSH user yet'}))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is still provisioning', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  testContextWithAppConfigVars
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(503, {reason: 'Server error!'}))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating the SSH user', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {
          addon: {name: fakeAddonName},
          app: {name: fakeHerokuAppName},
          name: fakeAddonAttachmentName,
        },
      ])
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(500))
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error getting the app config vars', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(503, {reason: 'Server error!'})
        .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:run', '-u', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating a personal DB user', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {
          addon: {name: fakeAddonName},
          app: {name: fakeHerokuAppName},
          name: fakeAddonAttachmentName,
        },
      ])
      .get(`/apps/${fakeHerokuAppName}/config-vars`)
      .reply(200, {MY_COOL_DB_SSH_TUNNEL_BPG_CONNECTION_INFO: 'INVALID!'}))
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .catch(
      `The ${color.configVar('MY_COOL_DB_SSH_TUNNEL_BPG_CONNECTION_INFO')} config variable value ` +
      `for ${color.app(fakeHerokuAppName)} is invalid. ` +
      'This may indicate that the config variable was manually edited.')
    .it('exits with an error when the app connection config var is invalid', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  function getTcpSocketListener(
    expectedEventName: string,
    expectedCallCount: number): (...args: unknown[]) => void {
    for (let callIndex = 0; callIndex < expectedCallCount; callIndex++) {
      const [eventName, socketListener] = capture(mockTcpSocketType.on).byCallIndex(callIndex)
      if (eventName === expectedEventName) {
        return socketListener
      }
    }

    return expect.fail(`Could not find a TCP socket listener for the "${expectedEventName}" event`)
  }

  function executeSshClientListener(): void {
    verify(mockSshClientType.on(anyString(), anyFunction())).once()
    const [sshClientEvent, sshClientListener] = capture(mockSshClientType.on).last()
    expect(sshClientEvent).to.equal('ready')

    sshClientListener()
  }
})