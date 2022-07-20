import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'

const fakeAddonName = 'my-super-neat-fake-addon'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeAppReadOnlyUsername = 'app_ro_12345'
const fakeAppReadWriteUsername = 'app_rw_67890'

const fakePersonalUser1 = 'user1@example.com'
const fakePersonalReadOnlyUsername1 = 'p_ro_abcdef'
const fakePersonalReadWriteUsername1 = 'p_rw_abcdef'

const fakePersonalUser2 = 'second-user@example.com'
const fakePersonalReadOnlyUsername2 = 'p_ro_ghijkl'
const fakePersonalReadWriteUsername2 = 'p_rw_ghijkl'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

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

const defaultTestContext = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {
        addon: {name: fakeAddonName},
        app: {name: fakeHerokuAppName},
        name: fakeAttachmentName,
      },
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

describe('database users command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(
          200,
          {
            users: [
              {
                displayName: null,
                readOnlyUsername: fakeAppReadOnlyUsername,
                readWriteUsername: fakeAppReadWriteUsername,
                userType: 'app',
              },
              {
                displayName: fakePersonalUser1,
                readOnlyUsername: fakePersonalReadOnlyUsername1,
                readWriteUsername: fakePersonalReadWriteUsername1,
                userType: 'personal',
              },
              {
                displayName: fakePersonalUser2,
                readOnlyUsername: fakePersonalReadOnlyUsername2,
                readWriteUsername: fakePersonalReadWriteUsername2,
                userType: 'personal',
              },
            ],
          }))
    .command(['borealis-pg:users', '--addon', fakeAddonName])
    .it('displays DB users for an add-on identified by add-on name', ctx => {
      expect(ctx.stderr).to.contain(`Fetching user list for add-on ${fakeAddonName}... done`)

      expect(ctx.stdout).to.containIgnoreSpaces(
        ' Add-on User             DB Read-only Username DB Read/Write Username \n' +
        ' ─────────────────────── ───────────────────── ────────────────────── \n' +
        ` Heroku App User ${fakeAppReadOnlyUsername} ${fakeAppReadWriteUsername} \n` +
        ` ${fakePersonalUser1} ${fakePersonalReadOnlyUsername1} ${fakePersonalReadWriteUsername1} \n` +
        ` ${fakePersonalUser2} ${fakePersonalReadOnlyUsername2} ${fakePersonalReadWriteUsername2} \n`)
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post(
        '/actions/addon-attachments/resolve',
        {addon_attachment: fakeAttachmentName, app: fakeHerokuAppName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAttachmentName},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(
          200,
          {
            users: [
              {
                displayName: null,
                readOnlyUsername: fakeAppReadOnlyUsername,
                readWriteUsername: fakeAppReadWriteUsername,
                userType: 'app',
              },
              {
                displayName: fakePersonalUser2,
                readOnlyUsername: fakePersonalReadOnlyUsername2,
                readWriteUsername: fakePersonalReadWriteUsername2,
                userType: 'personal',
              },
              {
                displayName: fakePersonalUser1,
                readOnlyUsername: fakePersonalReadOnlyUsername1,
                readWriteUsername: fakePersonalReadWriteUsername1,
                userType: 'personal',
              },
            ],
          }))
    .command(['borealis-pg:users', '--app', fakeHerokuAppName, '--addon', fakeAttachmentName])
    .it('displays DB users for an add-on identified by app and attachment name', ctx => {
      expect(ctx.stderr).to.contain(`Fetching user list for add-on ${fakeAddonName}... done`)

      expect(ctx.stdout).to.containIgnoreSpaces(
        ' Add-on User             DB Read-only Username DB Read/Write Username \n' +
        ' ─────────────────────── ───────────────────── ────────────────────── \n' +
        ` Heroku App User ${fakeAppReadOnlyUsername} ${fakeAppReadWriteUsername} \n` +
        ` ${fakePersonalUser2} ${fakePersonalReadOnlyUsername2} ${fakePersonalReadWriteUsername2} \n` +
        ` ${fakePersonalUser1} ${fakePersonalReadOnlyUsername1} ${fakePersonalReadWriteUsername1} \n`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(200, {users: []}))
    .command(['borealis-pg:users', '--addon', fakeAddonName])
    .it('displays a warning when there are no DB users', ctx => {
      expect(ctx.stderr).to.contain(`Fetching user list for add-on ${fakeAddonName}... done`)
      expect(ctx.stderr).to.contain('No users found')
    })

  test.stdout()
    .stderr()
    .nock(
      herokuApiBaseUrl,
      api => api.post('/oauth/authorizations')
        .reply(201, {id: fakeHerokuAuthId})  // Note the access_token field is missing
        .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
        .reply(200)
        .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
        .reply(200, [
          {
            addon: {name: fakeAddonName},
            app: {name: fakeHerokuAppName},
            name: fakeAttachmentName,
          },
        ]))
    .command(['borealis-pg:users', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error when there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:users'])
    .catch(/^Missing required flag:/)
    .it('exits with an error when there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(404, {reason: 'Not found'}))
    .command(['borealis-pg:users', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error when the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(422, {reason: 'Not done yet'}))
    .command(['borealis-pg:users', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error when the add-on is not finished provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/db-users`)
        .reply(500, {reason: 'Server error'}))
    .command(['borealis-pg:users', '--addon', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
