import color from '@heroku-cli/color'
import assert from 'assert'
import {ChildProcess} from 'child_process'
import {readFileSync} from 'fs'
import {Server, Socket} from 'net'
import path from 'path'
import {Client as PgClient} from 'pg'
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
import {consoleColours} from '../../command-components'
import {tunnelServices} from '../../ssh-tunneling'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'

const localPgHostname = 'pg-tunnel.borealis-data.com'
const defaultSshPort = 22
const customSshPort = 52_022
const defaultPgPort = 5432
const customPgPort = 65_432

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
const fakeDbCommand = 'my-cool-sql-command'

// The actual contents of this file don't matter because we're using mocks
const exampleFilePath = path.join(__dirname, '..', '..', '..', 'package.json')
const exampleFileContents = readExampleFile()

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

const testContextWithAppOption = testContextWithDefaultUsers
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

const testContextWithReadonlyPersonalUser = getPersonalUserTestContext(false)
const testContextWithReadWritePersonalUser = getPersonalUserTestContext(true)

describe('noninteractive run command', () => {
  let originalChildProcessFactory: typeof tunnelServices.childProcessFactory
  let originalNodeProcess: typeof tunnelServices.nodeProcess
  let originalPgClientFactory: typeof tunnelServices.pgClientFactory
  let originalTcpServerFactory: typeof tunnelServices.tcpServerFactory
  let originalSshClientFactory: typeof tunnelServices.sshClientFactory

  let mockChildProcessFactoryType: typeof tunnelServices.childProcessFactory
  let mockChildProcessType: ChildProcess
  let mockChildProcessStdoutType: internal.Readable
  let mockChildProcessStderrType: internal.Readable

  let mockNodeProcessType: NodeJS.Process

  let mockPgClientFactoryType: typeof tunnelServices.pgClientFactory
  let mockPgClientType: PgClient

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
    originalPgClientFactory = tunnelServices.pgClientFactory
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

    mockPgClientType = mock()
    const mockPgClientInstance = instance(mockPgClientType)
    when(mockPgClientType.on(anyString(), anyFunction())).thenReturn(mockPgClientInstance)

    mockPgClientFactoryType = mock()
    when(mockPgClientFactoryType.create(anything())).thenReturn(mockPgClientInstance)
    tunnelServices.pgClientFactory = instance(mockPgClientFactoryType)

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
    tunnelServices.pgClientFactory = originalPgClientFactory
    tunnelServices.sshClientFactory = originalSshClientFactory
    tunnelServices.tcpServerFactory = originalTcpServerFactory
  })

  defaultTestContext
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--shell-cmd', fakeShellCommand])
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
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--shell-cmd', fakeShellCommand])
    .it('executes a shell command without a DB port option', ctx => {
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
    .it('executes a shell command with a custom DB port option', () => {
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
      verify(mockNodeProcessType.exit())
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand])
    .it('executes a shell command even when the child process has no stdout or stderr', () => {
      when(mockChildProcessType.stdout).thenReturn(null)
      when(mockChildProcessType.stderr).thenReturn(null)

      executeSshClientListener()

      verify(mockChildProcessFactoryType.spawn(fakeShellCommand, anything())).once()
      verify(mockChildProcessStdoutType.on(anyString(), anyFunction())).never()
      verify(mockChildProcessStderrType.on(anyString(), anyFunction())).never()
    })

  defaultTestContext
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--db-cmd', fakeDbCommand])
    .it('executes a database command with the default (table) format', ctx => {
      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)

      executeSshClientListener()

      verify(mockPgClientFactoryType.create(deepEqual({
        host: localPgHostname,
        port: defaultPgPort,
        database: fakePgDbName,
        user: fakePgReadonlyAppUsername,
        password: fakePgReadonlyAppPassword,
      }))).once()

      // Check the PG client event listeners
      verify(mockPgClientType.on(anyString(), anyFunction())).times(2)
      verify(mockPgClientType.on('end', anyFunction())).once()
      verify(mockPgClientType.on('error', anyFunction())).once()
      for (let pgClientListenerIndex = 0; pgClientListenerIndex < 2; pgClientListenerIndex++) {
        const [pgClientEvent, pgClientListener] = capture(mockPgClientType.on)
          .byCallIndex(pgClientListenerIndex)

        if (pgClientEvent === 'end') {
          const pgClientEndListener: () => void = pgClientListener
          pgClientEndListener()

          verify(mockSshClientType.end()).once()
          verify(mockNodeProcessType.exit()).once()
        } else {
          const pgClientErrorListener: (err: Error) => void = pgClientListener
          const pgClientErrorMessage = 'my-pg-client-error'
          pgClientErrorListener(new Error(pgClientErrorMessage))

          expect(ctx.stderr).to.contain(pgClientErrorMessage)
          verify(mockNodeProcessType.exit(1)).once()
        }
      }

      verify(mockPgClientType.connect()).once()

      // Check the query callback function
      const queryCallback = getQueryCallbackFn()

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value1'}, {name: 'value2'}],
        oid: 32_304,
        rows: [{id: 21, value1: 'test1', value2: null}, {id: 33, value1: 'test2', value2: 'test3'}],
        rowCount: 2,
      })

      expect(ctx.stdout).to.contain(
        ' id value1 value2 \n' +
        ' ── ────── ────── \n' +
        ' 21 test1  null   \n' +
        ' 33 test2  test3  \n')
      expect(ctx.stdout).to.contain('(2 rows)')

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand, '-f', 'table'])
    .it('executes a database command with multiple result entries', ctx => {
      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)

      const uniqueValue = 'feb88f0d-b630-4c8a-bff5-7167c06c2624'

      executeSshClientListener()

      const queryCallback = getQueryCallbackFn()

      queryCallback(null, [
        {
          command: 'SELECT',
          fields: [{name: 'id'}, {name: 'value'}],
          oid: 32_304,
          rows: [{id: 21, value: 'test1'}, {id: 33, value: 'test2'}, {id: 0, value: uniqueValue}],
          rowCount: 3,
        },
        {
          command: 'INSERT',
          fields: [],
          rows: [],
          rowCount: 1,
        },
      ])

      // Only the last query result should have been output
      expect(ctx.stdout).not.to.contain(uniqueValue)
      expect(ctx.stdout).to.contain('(1 row)')

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--db-cmd',
      fakeDbCommand,
      '--format',
      'csv',
    ])
    .it('executes a database command with CSV output format', ctx => {
      executeSshClientListener()

      const queryCallback = getQueryCallbackFn()

      const expectedRowCount = 3

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value'}],
        oid: 32_304,
        rows: [{id: 21, value: 'test1'}, {id: 33, value: 'test2'}, {id: 0, value: 3}],
        rowCount: expectedRowCount,
      })

      expect(ctx.stdout).to.contain(
        'id,value\n' +
        '21,test1\n' +
        '33,test2\n' +
        '0,3\n')
      expect(ctx.stdout).not.to.contain(`(${expectedRowCount} rows)`)

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand, '-f', 'json'])
    .it('executes a database command with JSON output format', ctx => {
      executeSshClientListener()

      const queryCallback = getQueryCallbackFn()

      const expectedRowCount = 2

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value'}],
        oid: 32_304,
        rows: [{id: 16, value: 'test1'}, {id: 19, value: 'test2'}],
        rowCount: expectedRowCount,
      })

      expect(ctx.stdout).to.contain(
        JSON.stringify([{id: '16', value: 'test1'}, {id: '19', value: 'test2'}], undefined, 2))
      expect(ctx.stdout).not.to.contain(`(${expectedRowCount} rows)`)

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand, '-f', 'yaml'])
    .it('executes a database command with YAML output format', ctx => {
      executeSshClientListener()

      const queryCallback = getQueryCallbackFn()

      const expectedRowCount = 2

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value'}],
        oid: 32_304,
        rows: [{id: 2, value: 'test1'}, {id: 3, value: 'test2'}],
        rowCount: expectedRowCount,
      })

      expect(ctx.stdout).to.contain(
        "- id: '2'\n" +
        '  value: test1\n' +
        "- id: '3'\n" +
        '  value: test2\n')
      expect(ctx.stdout).not.to.contain(`(${expectedRowCount} rows)`)

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand])
    .it('executes a database command with no result', ctx => {
      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)

      executeSshClientListener()

      const queryCallback = getQueryCallbackFn()

      queryCallback(null, {})

      expect(ctx.stdout).to.contain('(0 rows)')

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command(['borealis-pg:run', '--addon', fakeAddonName, '--db-cmd-file', exampleFilePath])
    .it('executes a database command from a file', ctx => {
      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)

      executeSshClientListener()

      verify(mockPgClientFactoryType.create(deepEqual({
        host: localPgHostname,
        port: defaultPgPort,
        database: fakePgDbName,
        user: fakePgReadonlyAppUsername,
        password: fakePgReadonlyAppPassword,
      }))).once()

      verify(mockPgClientType.connect()).once()

      // Check the query callback function
      const queryCallback = getQueryCallbackFn(exampleFileContents)

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'foo'}],
        oid: 2761,
        rows: [
          {id: 9, foo: 'val1'},
          {id: 104, foo: 'val2'},
          {id: 23, foo: null},
          {id: 1, foo: 'one'},
        ],
        rowCount: 4,
      })

      expect(ctx.stdout).to.contain(
        ' id  foo  \n' +
        ' ─── ──── \n' +
        ' 9   val1 \n' +
        ' 104 val2 \n' +
        ' 23  null \n' +
        ' 1   one  \n')
      expect(ctx.stdout).to.contain('(4 rows)')

      verify(mockPgClientType.end()).once()
    })

  defaultTestContext
    .command([
      'borealis-pg:run',
      '-o',
      fakeAddonName,
      '-i',
      exampleFilePath,
      '-f',
      'csv',
    ])
    .it('executes a database command from a file with a different output format', ctx => {
      executeSshClientListener()

      const queryCallback = getQueryCallbackFn(exampleFileContents)

      const expectedRowCount = 2

      queryCallback(null, {
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'value'}],
        oid: 32_304,
        rows: [{id: 1, value: 'one'}, {id: 2, value: 'two'}],
        rowCount: expectedRowCount,
      })

      expect(ctx.stdout).to.contain(
        'id,value\n' +
        '1,one\n' +
        '2,two\n')
      expect(ctx.stdout).not.to.contain(`(${expectedRowCount} rows)`)

      verify(mockPgClientType.end()).once()
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:run',
      '-o',
      fakeAddonName,
      '-i',
      '/c2ee1b3e-fbbd-4915-ad77-f3c26a60714c.sql',
    ])
    .catch(/^File not found/)
    .it('handles an error when the database command file is not found', () => {
      verify(mockSshClientFactoryType.create()).never()
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--db-cmd-file',
      __dirname,
    ])
    .catch(/.*is a directory.*/)
    .it('handles an error when the database command file is actually a directory', () => {
      verify(mockSshClientFactoryType.create()).never()
      verify(mockTcpServerFactoryType.create(anyFunction())).never()
    })

  defaultTestContext
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand])
    .it('handles a database command error', ctx => {
      executeSshClientListener()

      verify(mockPgClientType.query(fakeDbCommand, anyFunction())).once()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, queryArg2] = capture(mockPgClientType.query).last()
      const queryCallback = (queryArg2 as unknown) as ((err: any, results: any) => void)

      const fakeErrorMessage = 'Bad query!'

      queryCallback(new Error(fakeErrorMessage), null)

      expect(ctx.stdout).to.equal('')
      expect(ctx.stderr).to.contain(fakeErrorMessage)

      verify(mockNodeProcessType.exit(1)).once()
    })

  testContextWithAppOption
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

      expect(ctx.stderr).to.contain(
        `Configuring read-only user session for add-on ${fakeAddonName}... done`)
      verify(mockChildProcessFactoryType.spawn(fakeShellCommand, anything())).once()
    })

  testContextWithWriteAccess
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--write-access',
      '--shell-cmd',
      fakeShellCommand,
    ])
    .it('configures the DB user with write access when requested', ctx => {
      executeSshClientListener()

      expect(ctx.stderr).to.contain(
        `Configuring read/write user session for add-on ${fakeAddonName}... done`)

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

  testContextWithReadonlyPersonalUser
    .command([
      'borealis-pg:run',
      '--personal-user',
      '--addon',
      fakeAddonName,
      '--shell-cmd',
      fakeShellCommand,
    ])
    .it('uses a readonly personal DB user when requested', () => {
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

  testContextWithReadWritePersonalUser
    .command([
      'borealis-pg:run',
      '-w',
      '-u',
      '-o',
      fakeAddonName,
      '-e',
      fakeShellCommand,
    ])
    .it('uses a read/write personal DB user when requested', () => {
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
      assert(typeof portForwardListener !== 'undefined')
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
      '--shell-cmd',
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
    .it('exits with an error if there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName])
    .catch(
      `Either ${consoleColours.cliOption('--db-cmd')}, ${consoleColours.cliOption('--db-cmd-file')} ` +
      `or ${consoleColours.cliOption('--shell-cmd')} must be specified`)
    .it('exits with an error if there are no command CLI options', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand, '-d', fakeDbCommand])
    .catch('--shell-cmd= cannot also be provided when using --db-cmd=')
    .it('exits with an error if both a shell command and a database command are provided', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:run',
      '--addon',
      fakeAddonName,
      '--shell-cmd',
      fakeShellCommand,
      '--format',
      'yaml',
    ])
    .catch('--shell-cmd= cannot also be provided when using --format=')
    .it('exits with an error if the --format option is specified for a shell command', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:run', '-o', fakeAddonName, '-d', fakeDbCommand, '-f', 'unknown'])
    .catch(/^Expected --format=unknown to be one of/)
    .it('exits with an error if an invalid output format is requested', ctx => {
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

      expect(ctx.stderr).to.contain(`Local port ${customPgPort} is not available`)
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
      assert(typeof portForwardListener !== 'undefined')

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
      api => api
        .post(`/heroku/resources/${fakeAddonName}/personal-db-users`, {enableWriteAccess: false})
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
    .command(['borealis-pg:run', '-o', fakeAddonName, '-e', fakeShellCommand, '-u'])
    .catch(/^Access to the add-on database has been temporarily revoked for personal users/)
    .it('exits with an error when DB write access is revoked', () => {
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
    const [sshClientEvent, listener] = capture(mockSshClientType.on).last()
    expect(sshClientEvent).to.equal('ready')

    const sshClientListener = (listener as unknown) as (() => void)

    sshClientListener()
  }

  function getQueryCallbackFn(expectedDbCommand: string = fakeDbCommand) {
    verify(mockPgClientType.query(anyString(), anyFunction())).once()
    verify(mockPgClientType.query(expectedDbCommand, anyFunction())).once()

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, queryArg2] = capture(mockPgClientType.query).last()

    return (queryArg2 as unknown) as ((err: any, results: any) => void)
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
            dbHost: fakePgReaderHost,
            dbPort: customPgPort,
            dbName: fakePgDbName,
            dbUsername: fakePgPersonalUsername,
            dbPassword: fakePgPersonalPassword,
          }))
    .nock(herokuApiBaseUrl, api => api
      .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
      .reply(200, [
        {
          addon: {name: fakeAddonName},
          app: {name: fakeHerokuAppName},
          name: fakeAddonAttachmentName,
        },
      ]))
}

function readExampleFile(): string {
  return readFileSync(exampleFilePath, {encoding: 'UTF-8'})
}
