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

const fakeBorealisPgAddonName = 'borealis-pg-my-fake-addon'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSshHost = 'my-fake-ssh-hostname'
const fakeSshUsername = 'ssh-test-user'
const fakeSshPrivateKey = 'my-fake-ssh-private-key'
const fakePgHost = 'my-fake-pg-hostname'
const fakePgUsername = 'db_test_user'
const fakePgPassword = 'my-fake-db-password'
const fakePgDbName = 'fake_db'

const expectedSshHostKeyFormat = 'ssh-ed25519'
const expectedSshHostKey = 'AAAAC3NzaC1lZDI1NTE5AAAAIKkk9uh8+g/gKlLlbi4sVv4VJkiaLjYOJj+wVVyTGzhI'
const expectedSshHostKeyEntry = `${expectedSshHostKeyFormat} ${expectedSshHostKey}`

const baseTestContext = test
  .stdout()
  .stderr()
  .nock(herokuApiBaseUrl, api =>
    api.post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read', 'identity'],
    })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))

const testContextWithoutPorts = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/adhoc-users`)
      .reply(
        200,
        {
          dbHost: fakePgHost,
          dbName: fakePgDbName,
          dbUsername: fakePgUsername,
          dbPassword: fakePgPassword,
          sshHost: fakeSshHost,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        }))

const testContextWithExplicitPorts = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/adhoc-users`)
      .reply(
        200,
        {
          dbHost: fakePgHost,
          dbPort: customPgPort,
          dbName: fakePgDbName,
          dbUsername: fakePgUsername,
          dbPassword: fakePgPassword,
          sshHost: fakeSshHost,
          sshPort: customSshPort,
          sshUsername: fakeSshUsername,
          sshPrivateKey: fakeSshPrivateKey,
          publicSshHostKey: expectedSshHostKeyEntry,
        }))

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
  let mockSshStreamType: ClientChannel

  beforeEach(() => {
    originalNodeProcess = tunnelServices.nodeProcess
    originalTcpServerFactory = tunnelServices.tcpServerFactory
    originalSshClientFactory = tunnelServices.sshClientFactory

    mockNodeProcessType = mock()
    tunnelServices.nodeProcess = instance(mockNodeProcessType)

    mockTcpServerType = mock(Server)
    const mockTcpServer = instance(mockTcpServerType)
    when(mockTcpServerType.on(anyString(), anyFunction())).thenReturn(mockTcpServer)
    when(mockTcpServerType.listen(anyNumber(), anyString())).thenReturn(mockTcpServer)
    when(mockTcpServerType.close()).thenReturn(mockTcpServer)

    mockTcpServerFactoryType = mock()
    when(mockTcpServerFactoryType.create(anyFunction())).thenReturn(mockTcpServer)
    tunnelServices.tcpServerFactory = instance(mockTcpServerFactoryType)

    mockSshClientType = mock(SshClient)
    const mockSshClient = instance(mockSshClientType)
    when(mockSshClientType.on(anyString(), anyFunction())).thenReturn(mockSshClient)

    mockSshClientFactoryType = mock()
    when(mockSshClientFactoryType.create()).thenReturn(mockSshClient)
    tunnelServices.sshClientFactory = instance(mockSshClientFactoryType)

    mockTcpSocketType = mock(Socket)
    mockSshStreamType = mock()
  })

  afterEach(() => {
    tunnelServices.nodeProcess = originalNodeProcess
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('starts the proxy server', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).once()
      verify(mockTcpServerType.on(anyString(), anyFunction())).once()
      verify(mockTcpServerType.on('error', anyFunction())).once()
      verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
      verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('connects to the SSH server with no SSH port in the connection info', () => {
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
      expect(hostVerifier(expectedSshHostKey)).to.be.true
      expect(hostVerifier('no good!')).to.be.false
    })

  testContextWithExplicitPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
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
      expect(hostVerifier(Buffer.from(expectedSshHostKey, 'base64'))).to.be.true
      expect(hostVerifier(Buffer.from('no good!', 'base64'))).to.be.false
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('outputs DB connection instructions with no DB port flag', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stdout).to.containIgnoreSpaces(`Username: ${fakePgUsername}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Port: ${defaultPgPort}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `URL: postgres://${fakePgUsername}:${fakePgPassword}@${localPgHostname}:${defaultPgPort}/${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreCase('Ctrl+C')
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName, '--port', '15432'])
    .it('outputs DB connection instructions for a custom DB port flag', ctx => {
      verify(mockSshClientType.on(anyString(), anyFunction())).once()
      const [event, listener] = capture(mockSshClientType.on).last()
      expect(event).to.equal('ready')

      listener()

      expect(ctx.stdout).to.containIgnoreSpaces(`Username: ${fakePgUsername}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Password: ${fakePgPassword}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Host: ${localPgHostname}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Port: 15432')
      expect(ctx.stdout).to.containIgnoreSpaces(`Database name: ${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `URL: postgres://${fakePgUsername}:${fakePgPassword}@${localPgHostname}:15432/${fakePgDbName}`)
      expect(ctx.stdout).to.containIgnoreCase('Ctrl+C')
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('starts SSH port forwarding with no DB port in the connection info', () => {
      const mockTcpSocket = instance(mockTcpSocketType)
      const mockSshStream = instance(mockSshStreamType)

      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocket)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgHost,
        defaultPgPort,
        anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      portForwardListener(undefined, mockSshStream)

      verify(mockTcpSocketType.pipe(mockSshStream)).once()
      verify(mockSshStreamType.pipe(mockTcpSocket)).once()

      verify(mockTcpSocketType.on(anyString(), anyFunction())).once()
      verify(mockTcpSocketType.on('error', anyFunction())).once()
    })

  testContextWithExplicitPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('starts SSH port forwarding with an explicit DB port in the connection info', () => {
      const mockTcpSocket = instance(mockTcpSocketType)
      const mockSshStream = instance(mockSshStreamType)
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocket)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgHost,
        customPgPort,
        anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      portForwardListener(undefined, mockSshStream)

      verify(mockTcpSocketType.pipe(mockSshStream)).once()
      verify(mockSshStreamType.pipe(mockTcpSocket)).once()

      verify(mockTcpSocketType.on(anyString(), anyFunction())).once()
      verify(mockTcpSocketType.on('error', anyFunction())).once()
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
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
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName, '--port', 'not-an-integer'])
    .catch('Value "not-an-integer" is not a valid integer')
    .it('rejects a --port value that is not an integer', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName, '-p', '0'])
    .catch('Value 0 is outside the range of valid port numbers')
    .it('rejects a --port value that is less than 1', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName, '--port', '65536'])
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
        .reply(200))
    .command(['borealis-pg:tunnel', '-o', fakeBorealisPgAddonName])
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

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/adhoc-users`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} was not found or is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/adhoc-users`)
        .reply(422, {reason: 'Add-on is not ready yet'}))
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is still provisioning', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/adhoc-users`)
        .reply(503, {reason: 'Server error!'}))
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if there is a Borealis API server error', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  testContextWithoutPorts
    .do(() => when(mockSshClientFactoryType.create()).thenThrow(new Error('An error')))
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .catch('An error')
    .it('throws an unexpected error when it occurs', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  testContextWithoutPorts
    .command([
      'borealis-pg:tunnel',
      '--addon',
      fakeBorealisPgAddonName,
      '-p',
      customPgPort.toString(),
    ])
    .it('handles a local port conflict', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      errorListener({code: 'EADDRINUSE'})

      verify(mockNodeProcessType.exit(1)).once()
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
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

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('handles an error when starting port forwarding', () => {
      const mockTcpSocket = instance(mockTcpSocketType)
      const mockSshStream = instance(mockSshStreamType)

      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocket)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()

      const fakeError = new Error('Just testing!')
      try {
        portForwardListener(fakeError, mockSshStream)

        expect.fail('The port forward listener call should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.pipe(mockSshStream)).never()
      verify(mockSshStreamType.pipe(mockTcpSocket)).never()

      verify(mockTcpSocketType.on(anyString(), anyFunction())).never()
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('handles a server connection reset', () => {
      const mockTcpSocket = instance(mockTcpSocketType)
      const mockSshStream = instance(mockSshStreamType)

      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocket)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      portForwardListener(undefined, mockSshStream)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_4, socketListener] = capture(mockTcpSocketType.on).last()
      const socketErrListener = socketListener as ((err: unknown) => void)

      try {
        socketErrListener({code: 'ECONNRESET'})
      } catch (error) {
        expect.fail('The socket error listener should not have thrown an error')
      }

      verify(mockTcpSocketType.destroy()).once()
    })

  testContextWithoutPorts
    .command(['borealis-pg:tunnel', '--addon', fakeBorealisPgAddonName])
    .it('handles an unexpected TCP socket error', () => {
      const mockTcpSocket = instance(mockTcpSocketType)
      const mockSshStream = instance(mockSshStreamType)

      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocket)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, _1, _2, _3, portForwardListener] = capture(mockSshClientType.forwardOut).last()
      portForwardListener(undefined, mockSshStream)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_4, socketListener] = capture(mockTcpSocketType.on).last()
      const socketErrListener = socketListener as ((err: unknown) => void)

      const fakeError = new Error('Foobarbaz')
      try {
        socketErrListener(fakeError)

        expect.fail('The socket error listener should have thrown an error')
      } catch (error) {
        expect(error).to.equal(fakeError)
      }

      verify(mockTcpSocketType.destroy()).never()
    })
})
