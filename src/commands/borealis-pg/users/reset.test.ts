import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonName = 'my-super-neat-fake-addon'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'
const fakeHerokuAppName = 'my-super-neat-fake-app'

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

describe('database credentials reset command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(200, {}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .it('resets all DB credentials for an add-on identified by add-on name', ctx => {
      expect(ctx.stderr).to.contain(
        `Resetting all database credentials for add-on ${fakeAddonName}... done`)
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
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(200, {}))
    .command(['borealis-pg:users:reset', '--app', fakeHerokuAppName, '--addon', fakeAttachmentName])
    .it('resets all DB credentials for an add-on identified by app and attachment name', ctx => {
      expect(ctx.stderr).to.contain(
        `Resetting all database credentials for add-on ${fakeAddonName}... done`)
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
    .command(['borealis-pg:users:reset', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error when there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:users:reset'])
    .catch(/^Missing required flag:/)
    .it('exits with an error when there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(400, {reason: 'Maintenance'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch(
      `Add-on ${color.addon(fakeAddonName)} is currently undergoing maintenance. ` +
      'Try again in a few minutes.')
    .it('exits with an error when the add-on is undergoing maintenance', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(403, {reason: 'DB write access revoked'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch(/^Write access to the add-on database has been temporarily revoked./)
    .it('exits with an error when the add-on is undergoing maintenance', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(404, {reason: 'Not found'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error when the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(422, {reason: 'Not done yet'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error when the add-on is not finished provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(500, {reason: 'Server error'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
