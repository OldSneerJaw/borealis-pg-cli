import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = 'd04a3bfc-88d9-4787-92ef-8c8be5e3f0e0'
const fakeAddonName = 'my-super-neat-fake-addon'

const fakeAttachmentId = 'fdc2648b-6e3d-40b9-8884-bc32c8610b83'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'

const fakeHerokuAppId = '47bb295d-65b9-43cd-9528-ad52aa22034e'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const defaultTestContext = test.stdout()
  .stderr()
  .nock(herokuApiBaseUrl, api => api
    .post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read', 'identity'],
    })
    .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
    .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
    .reply(200)
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {
        addon: {id: fakeAddonId, name: fakeAddonName},
        app: {id: fakeHerokuAppId, name: fakeHerokuAppName},
        id: fakeAttachmentId,
        name: fakeAttachmentName,
      },
    ])
    .get(`/addons/${fakeAddonId}`)
    .reply(200, {addon_service: {name: 'borealis-pg'}, id: fakeAddonId, name: fakeAddonName}))

describe('database credentials reset command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(200, {}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .it('resets all DB credentials for an add-on', ctx => {
      expect(ctx.stderr).to.contain(
        `Resetting all database credentials for add-on ${fakeAddonName}... done`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/db-users/credentials`)
        .reply(400, {reason: 'Maintenance'}))
    .command(['borealis-pg:users:reset', '--addon', fakeAddonName])
    .catch(/^Add-on is currently undergoing maintenance/)
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
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
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
    .catch('Add-on is not finished provisioning')
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

  test.stdout()
    .stderr()
    .command(['borealis-pg:users:reset'])
    .catch(/^Borealis Isolated Postgres add-on could not be found/)
    .it('exits with an error when neither of the add-on or app name params were received', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
