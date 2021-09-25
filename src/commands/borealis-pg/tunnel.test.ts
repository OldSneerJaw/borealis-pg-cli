import color from '@heroku-cli/color'
import {Server, Socket} from 'net'
import {Client as SshClient, ClientChannel} from 'ssh2'
import {
  anyFunction,
  anyNumber,
  anyString,
  anything,
  capture,
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
const fakePgHost = 'my-fake-pg-hostname'
const fakePgReadonlyUsername = 'ro_db_test_user'
const fakePgReadWriteUsername = 'rw_db_test_user'
const fakePgPassword = 'my-fake-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

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

const testContextWithDefaultUsers = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: customSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })
      .post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
      .reply(
        200,
        {
          dbHost: fakePgHost,
          dbPort: customPgPort,
          dbName: fakePgDbName,
          dbUsername: fakePgReadonlyUsername,
          dbPassword: fakePgPassword,
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

const testContextWithWriteAccess = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshPort: customSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })
      .post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
      .reply(
        200,
        {
          dbHost: fakePgHost,
          dbPort: customPgPort,
          dbName: fakePgDbName,
          dbUsername: fakePgReadWriteUsername,
          dbPassword: fakePgPassword,
        }))
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

const testContextWithImplicitPorts = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
      .reply(
        200,
        {
          sshHost: fakeSshHost,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        })
      .post(
        `/heroku/resources/${fakeAddonName}/adhoc-db-users`,
        {enableWriteAccess: false})
      .reply(
        200,
        {
          dbHost: fakePgHost,
          dbName: fakePgDbName,
          dbUsername: fakePgReadonlyUsername,
          dbPassword: fakePgPassword,
        }))
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

describe('secure tunnel command', () => {
  let originalNodeProcess: NodeJS.Process
  let originalTcpServerFactory: {create: (connectionListener: (socket: Socket) => void) => Server}
  let originalSshClientFactory: {create: () => SshClient}

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
    originalNodeProcess = tunnelServices.nodeProcess
    originalTcpServerFactory = tunnelServices.tcpServerFactory
    originalSshClientFactory = tunnelServices.sshClientFactory

    mockNodeProcessType = mock()
    tunnelServices.nodeProcess = instance(mockNodeProcessType)

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
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('starts the proxy server', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).once()
      verify(mockTcpServerType.on(anyString(), anyFunction())).once()
      verify(mockTcpServerType.on('error', anyFunction())).once()
      verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
      verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
    })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('connects to the SSH server with an explicit SSH port in the connection info', () => {
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

  testContextWithImplicitPorts
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('connects to the SSH server without an SSH port in the connection info', () => {
      verify(mockSshClientFactoryType.create()).once()
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      verify(mockSshClientType.on('ready', anyFunction())).once()

      verify(mockSshClientType.connect(anything())).once()
      const [connectConfig] = capture(mockSshClientType.connect).last()
      expect(connectConfig.host).to.equal(fakeSshHost)
      expect(connectConfig.port).to.equal(defaultSshPort)
      expect(connectConfig.username).to.equal(fakeSshUsername)
      expect(connectConfig.privateKey).to.equal(fakeSshPrivateKey)
      expect(connectConfig.algorithms).to.deep.equal({serverHostKey: [expectedSshHostKeyFormat]})

      expect(connectConfig.hostVerifier).to.exist
      const hostVerifier = connectConfig.hostVerifier as ((keyHash: unknown) => boolean)
      expect(hostVerifier(Buffer.from(expectedSshHostKey, 'base64'))).to.be.true
      expect(hostVerifier(Buffer.from('no good!', 'base64'))).to.be.false
    })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('outputs DB connection instructions without a DB port flag', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stdout).to.containIgnoreSpaces(`Username: ${fakePgReadonlyUsername}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Port: ${defaultPgPort}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `URL: postgres://${fakePgReadonlyUsername}:${fakePgPassword}@${localPgHostname}:${defaultPgPort}/${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreCase('Ctrl+C')
    })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName, '--port', '15432'])
    .it('outputs DB connection instructions for a custom DB port flag', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stdout).to.containIgnoreSpaces(`Username: ${fakePgReadonlyUsername}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Port: 15432')
      expect(ctx.stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `URL: postgres://${fakePgReadonlyUsername}:${fakePgPassword}@${localPgHostname}:15432/${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreCase('Ctrl+C')
    })

  testContextWithAppFlag
    .command(['borealis-pg:tunnel', '--app', fakeHerokuAppName, '--addon', fakeAddonAttachmentName])
    .it('finds the correct add-on using its app and attachment names', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stderr).to.endWith(
        `Configuring temporary user for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
    })

  testContextWithWriteAccess
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName, '--write-access'])
    .it('configures the DB user with write access when requested', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stdout).to.containIgnoreSpaces(`Username: ${fakePgReadWriteUsername}`)
    })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('starts SSH port forwarding with an explicit DB port in the connection info', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgHost,
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

  testContextWithImplicitPorts
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('starts SSH port forwarding without a DB port in the connection info', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgHost,
        defaultPgPort,
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

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('exits gracefully when the user presses Ctrl+C', () => {
      verify(mockNodeProcessType.on(anyString(), anyFunction())).once()
      verify(mockNodeProcessType.on('SIGINT', anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, processListener] = capture(mockNodeProcessType.on).last()
      const sigintListener = (processListener as unknown) as NodeJS.SignalsListener
      sigintListener('SIGINT')

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit(0)).once()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName, '--port', 'not-an-integer'])
    .catch('Value "not-an-integer" is not a valid integer')
    .it('rejects a --port value that is not an integer', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName, '-p', '0'])
    .catch('Value 0 is outside the range of valid port numbers')
    .it('rejects a --port value that is less than 1', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName, '--port', '65536'])
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
    .command(['borealis-pg:tunnel', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:tunnel'])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .do(() => when(mockSshClientFactoryType.create()).thenThrow(new Error('An error')))
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .catch('An error')
    .it('throws an unexpected SSH client error when it occurs', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  defaultTestContext
    .command([
      'borealis-pg:tunnel',
      '--addon',
      fakeAddonName,
      '-p',
      customPgPort.toString(),
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
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
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
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
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
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('handles a server connection reset', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      const expectedCallCount = 2
      verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
      const socketListener = getTcpSocketListener('error', expectedCallCount)

      try {
        socketListener({code: 'ECONNRESET'})
      } catch (error) {
        expect.fail('The socket error listener should not have thrown an error')
      }

      verify(mockTcpSocketType.destroy()).once()
    })

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
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

  defaultTestContext
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .it('handles a TCP socket being ended', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      const expectedCallCount = 2
      verify(mockTcpSocketType.on(anyString(), anyFunction())).times(expectedCallCount)
      const socketListener = getTcpSocketListener('end', expectedCallCount)

      socketListener()

      verify(mockTcpSocketType.remotePort).once()
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
        .reply(404, {reason: 'Add-on does not exist for an ad hoc DB user'})
        .post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
        .reply(404, {reason: 'Add-on does not exist for an ad hoc SSH user'}))
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', () => {
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
      api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
        .reply(422, {reason: 'Add-on is not ready for an ad hoc DB user yet'})
        .post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
        .reply(422, {reason: 'Add-on is not ready for an ad hoc SSH user yet'}))
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is still provisioning', () => {
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
      api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
        .reply(503, {reason: 'Server error!'})
        .post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating the DB user', () => {
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
      api => api.post(`/heroku/resources/${fakeAddonName}/adhoc-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgHost,
            dbName: fakePgDbName,
            dbUsername: fakePgReadonlyUsername,
            dbPassword: fakePgPassword,
          })
        .post(`/heroku/resources/${fakeAddonName}/adhoc-ssh-users`)
        .reply(503, {reason: 'Server error!'}))
    .command(['borealis-pg:tunnel', '--addon', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating the SSH user', () => {
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
})
