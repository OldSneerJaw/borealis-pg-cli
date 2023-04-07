import {DateTime} from 'luxon'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = '330ab3c7-faf5-4da7-98ed-d1eac0983372'
const fakeAddonName = 'my-super-neat-fake-addon'

const fakeAttachmentId = '1fb51235-686d-4ded-80f1-fb8b3d4839d0'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'

const fakeHerokuAppId = 'fdedc223-6782-40c1-8431-0a65348732f5'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeEarliestRestorableTime = '2023-02-21T03:15:28.675+01:00'
const fakeLatestRestorableTime = '2023-02-24T11:04:46.081-04:00'

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
    .get(`/apps/${fakeHerokuAppName}/addons`)
    .reply(200, [
      {
        addon_service: {name: 'other-addon-service'},
        id: '046a3ad2-61bd-41e4-aa46-b9b9c88a7c18',
        name: 'other-addon',
      },
      {addon_service: {name: 'borealis-pg'}, id: fakeAddonId, name: fakeAddonName},
    ])
    .get(`/addons/${fakeAddonId}/addon-attachments`)
    .reply(200, [
      {
        addon: {id: fakeAddonId, name: fakeAddonName},
        app: {id: fakeHerokuAppId, name: fakeHerokuAppName},
        id: fakeAttachmentId,
        name: fakeAttachmentName,
      },
    ]))

describe('database restore capabilities command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(
          200,
          {
            cloneSupported: true,
            earliestRestorableTime: fakeEarliestRestorableTime,
            latestRestorableTime: fakeLatestRestorableTime,
            restoreSupported: true,
          }))
    .command(['borealis-pg:restore:capabilities', '--app', fakeHerokuAppName])
    .it('displays restore capabilities of a single tenant add-on', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces('Nightly Backups Status: Enabled')
      expect(ctx.stdout).to.containIgnoreSpaces('Clone Supported: Yes')
      expect(ctx.stdout).to.containIgnoreSpaces('Point-in-time Restore Supported: Yes')
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Earliest Restorable Time: ${DateTime.fromISO(fakeEarliestRestorableTime).toISO()}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Latest Restorable Time: ${DateTime.fromISO(fakeLatestRestorableTime).toISO()}`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(
          200,
          {
            cloneSupported: true,
            earliestRestorableTime: null,
            latestRestorableTime: null,
            restoreSupported: false,
          }))
    .command(['borealis-pg:restore:capabilities', '-a', fakeHerokuAppName])
    .it('displays restore capabilities of a multi-tenant add-on', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces('Nightly Backups Status: Enabled')
      expect(ctx.stdout).to.containIgnoreSpaces('Clone Supported: Yes')
      expect(ctx.stdout).to.containIgnoreSpaces('Point-in-time Restore Supported: No')
      expect(ctx.stdout).to.containIgnoreSpaces('Earliest Restorable Time: N/A')
      expect(ctx.stdout).to.containIgnoreSpaces('Latest Restorable Time: N/A')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(
          200,
          {
            cloneSupported: false,
            earliestRestorableTime: fakeEarliestRestorableTime,
            latestRestorableTime: fakeLatestRestorableTime,
            restoreSupported: true,
          }))
    .command(['borealis-pg:restore:info', '-a', fakeHerokuAppName])
    .it('displays restore capabilities via the borealis-pg:restore:info alias', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces('Nightly Backups Status: Enabled')
      expect(ctx.stdout).to.containIgnoreSpaces('Clone Supported: No')
      expect(ctx.stdout).to.containIgnoreSpaces('Point-in-time Restore Supported: Yes')
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Earliest Restorable Time: ${DateTime.fromISO(fakeEarliestRestorableTime).toISO()}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Latest Restorable Time: ${DateTime.fromISO(fakeLatestRestorableTime).toISO()}`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(404, {reason: 'Not found'}))
    .command(['borealis-pg:restore:capabilities', '-a', fakeHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error when the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(422, {reason: 'Not finished yet!'}))
    .command(['borealis-pg:restore:capabilities', '-a', fakeHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error when the add-on is not finished provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/restore-capabilities`)
        .reply(500, {reason: 'Server error'}))
    .command(['borealis-pg:restore:capabilities', '-a', fakeHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
