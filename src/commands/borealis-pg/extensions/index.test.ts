import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonId = '0818035e-0103-4f85-880d-c3b4a712cf8d'
const fakeAddonName = 'borealis-pg-my-fake-addon'

const fakeAttachmentId = 'eaa7f0f9-9562-4ba3-b8dc-3c488ad73666'
const fakeAttachmentName = 'MY_COOL_DB'

const fakeHerokuAppId = '2ee2aea8-9a2f-48b2-8f86-b4aa504b35f7'
const fakeHerokuAppName = 'my-fake-heroku-app'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-db-schema'
const fakeExt1Version = '16.8.5'

const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-db-schema'
const fakeExt2Version = '0.7.15'

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

describe('extension list command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {
          extensions: [
            {name: fakeExt1, schema: fakeExt1Schema, version: fakeExt1Version},
            {name: fakeExt2, schema: fakeExt2Schema, version: fakeExt2Version},
          ],
        }))
    .command(['borealis-pg:extensions', '--addon', fakeAddonName])
    .it('outputs the list of installed extensions', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
        `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {extensions: []}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .it('outputs a warning if there are no extensions', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n` +
        ' ›   Warning: No extensions found\n')
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error if the add-on is not done provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(500, {reason: 'Something went wrong'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions'])
    .catch(/^Borealis Isolated Postgres add-on could not be found/)
    .it('exits with an error when neither of the add-on or app name params were received', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
