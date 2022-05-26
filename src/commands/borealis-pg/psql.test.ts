import color from '@heroku-cli/color'
import {ChildProcess} from 'child_process'
import {Server, Socket} from 'net'
import {Client as SshClient, ClientChannel} from 'ssh2'
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
import {tunnelServices} from '../../ssh-tunneling'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const defaultPgPort = 5432
const customPgPort = 65_432
const defaulPsqlPath = 'psql'
const customPsqlPath = 'bin/run'  // This is a real file path

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
const fakePgPersonalUsername = 'personal_db_test_user'
const fakePgPersonalPassword = 'my-fake-personal-db-password'
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
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {
        addon: {name: fakeAddonName},
        app: {name: fakeHerokuAppName},
        name: fakeAddonAttachmentName,
      },
    ]))

const readOnlyTestContext = getPersonalUserTestContext(false)
const readWriteTestContext = getPersonalUserTestContext(true)

describe('interactive psql command', () => {
  let originalChildProcessFactory: typeof tunnelServices.childProcessFactory
  let originalNodeProcess: typeof tunnelServices.nodeProcess
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory

  let mockChildProcessFactoryType: typeof tunnelServices.childProcessFactory
  let mockChildProcessType: ChildProcess

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
    originalSshClientFactory = tunnelServices.sshClientFactory
    originalTcpServerFactory = tunnelServices.tcpServerFactory

    mockChildProcessType = mock()
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

  readOnlyTestContext
    .command(['borealis-pg:psql', '--addon', fakeAddonName])
    .it('starts the proxy server', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).once()
      verify(mockTcpServerType.on(anyString(), anyFunction())).once()
      verify(mockTcpServerType.on('error', anyFunction())).once()
      verify(mockTcpServerType.listen(anyNumber(), anyString())).once()
      verify(mockTcpServerType.listen(defaultPgPort, localPgHostname)).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .it('connects to the SSH server', () => {
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

  readOnlyTestContext
    .command(['borealis-pg:psql', '--addon', fakeAddonName])
    .it('starts a psql session and ends with an exit code', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()

      // Check what happens when the child process ends with a nonzero exit code
      const fakeExitCode = 14

      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(fakeExitCode, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit(fakeExitCode))
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .it('starts a psql session and ends without an exit code', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()

      // Check what happens when the child process ends without an exit code
      verify(mockChildProcessType.on(anyString(), anyFunction())).once()

      const [childProcEvent, childProcListener] = capture(mockChildProcessType.on).last()
      expect(childProcEvent).to.equal('exit')

      const childProcExitListener: (code: number | null, _: any) => void = childProcListener

      childProcExitListener(null, null)

      verify(mockSshClientType.end()).once()
      verify(mockNodeProcessType.exit())
    })

  readWriteTestContext
    .command(['borealis-pg:psql', '--addon', fakeAddonName, '--write-access'])
    .it('starts a psql session with DB write access', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '--addon', fakeAddonName, '--port', customPgPort.toString()])
    .it('starts a psql session with a custom Postgres port', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: customPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '--addon', fakeAddonName, '--binary-path', customPsqlPath])
    .it('starts a psql session with a custom psql path', _ => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        customPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()
    })

  test.stdout()
    .stderr()
    .nock(herokuApiBaseUrl, api => api
      .post('/oauth/authorizations')
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))
    .nock(herokuApiBaseUrl, api => api
      .post(
        '/actions/addon-attachments/resolve',
        {app: fakeHerokuAppName, addon_attachment: fakeAddonAttachmentName})
      .reply(200, [
        {
          addon: {name: fakeAddonName},
          app: {name: fakeHerokuAppName},
          name: fakeAddonAttachmentName,
        },
      ]))
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          })
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-a', fakeHerokuAppName, '-o', fakeAddonAttachmentName])
    .it('starts a psql session with app name and attachment name', ctx => {
      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(
        defaulPsqlPath,
        deepEqual({
          env: {
            ...tunnelServices.nodeProcess.env,
            PGHOST: localPgHostname,
            PGPORT: defaultPgPort.toString(),
            PGDATABASE: fakePgDbName,
            PGUSER: fakePgPersonalUsername,
            PGPASSWORD: fakePgPersonalPassword,
          },
          shell: true,
          stdio: 'inherit',
        }))).once()

      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .it('starts SSH port forwarding for a read-only user', () => {
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

  readWriteTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName, '-w'])
    .it('starts SSH port forwarding for a read/write user', () => {
      const [tcpConnectionListener] = capture(mockTcpServerFactoryType.create).last()
      tcpConnectionListener(mockTcpSocketInstance)

      verify(mockSshClientType.forwardOut(
        localPgHostname,
        defaultPgPort,
        fakePgWriterHost,
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

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .it('does not end the process when the user presses Ctrl+C', () => {
      verify(mockNodeProcessType.on(anyString(), anyFunction())).once()
      verify(mockNodeProcessType.on('SIGINT', anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, processListener] = capture(mockNodeProcessType.on).last()
      const sigintListener = (processListener as unknown) as NodeJS.SignalsListener
      sigintListener('SIGINT')

      verify(mockSshClientType.end()).never()
      verify(mockNodeProcessType.exit()).never()
      verify(mockNodeProcessType.exit(anyNumber())).never()
    })

  test
    .stdout()
    .stderr()
    .command(
      ['borealis-pg:psql', '--addon', fakeAddonName, '--binary-path', '/this/is/not/a/real/file'])
    .catch('The file "/this/is/not/a/real/file" does not exist')
    .it('rejects a custom psql path that does not exist', _ => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:psql', '--addon', fakeAddonName, '--port', 'port-must-be-an-integer'])
    .catch('Value "port-must-be-an-integer" is not a valid integer')
    .it('rejects a custom port that is not an integer', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:psql', '-o', fakeAddonName, '-p', '-1'])
    .catch('Value -1 is outside the range of valid port numbers')
    .it('rejects a custom port that is less than 1', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test
    .stdout()
    .stderr()
    .command(['borealis-pg:psql', '-o', fakeAddonName, '-p', '65536'])
    .catch('Value 65536 is outside the range of valid port numbers')
    .it('rejects a custom port that is greater than 65535', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  test.stdout()
    .stderr()
    .nock(
      herokuApiBaseUrl,
      api => api.post('/oauth/authorizations')
        .reply(201, {id: fakeHerokuAuthId})  // Note that the access_token field is missing
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
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:psql'])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  readOnlyTestContext
    .do(() => when(mockSshClientFactoryType.create()).thenThrow(new Error('An error')))
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch('An error')
    .it('throws an unexpected SSH client error when encountered', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName, '-p', customPgPort.toString()])
    .it('handles a local port conflict', ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, listener] = capture(mockTcpServerType.on).last()
      const errorListener = listener as ((err: unknown) => void)

      errorListener({code: 'EADDRINUSE'})

      expect(ctx.stderr).to.contain(`Local port ${customPgPort} is not available`)
      verify(mockNodeProcessType.exit(1)).once()
    })

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
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

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
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

  readOnlyTestContext
    .command(['borealis-pg:psql', '-o', fakeAddonName])
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

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(404, {reason: 'Add-on does not exist for this personal SSH user'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(422, {reason: 'Add-on is not ready for a personal SSH user yet'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          201,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is still provisioning', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(503, {reason: 'Server error!'})
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(
          200,
          {
            dbHost: fakePgReaderHost,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating the SSH user', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`)
        .reply(403, {reason: 'DB write access revoked'})
        .post(`/heroku/resources/${fakeAddonName}/personal-ssh-users`)
        .reply(
          200,
          {
            sshHost: fakeSshHost,
            sshUsername: fakeSshUsername,
            sshPrivateKey: fakeSshPrivateKey,
            publicSshHostKey: expectedSshHostKeyEntry,
          }))
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch(/^Access to the add-on database has been temporarily revoked for personal users/)
    .it('exits with an error when DB write access is revoked', () => {
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
      verify(mockSshClientFactoryType.create()).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess: false})
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
    .command(['borealis-pg:psql', '-o', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API error while creating a personal DB user', () => {
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

function getPersonalUserTestContext(enableWriteAccess: boolean) {
  return baseTestContext
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
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess})
        .reply(
          200,
          {
            dbHost: enableWriteAccess ? fakePgWriterHost : fakePgReaderHost,
            dbPort: customPgPort,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
}
