import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonName = 'borealis-pg-my-fake-addon'
const fakeAddonAttachmentName = 'MY_COOL_DB'
const fakeHerokuAppName = 'my-fake-heroku-app'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-db-schema'
const fakeExt1Version = '16.8.5'
const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-db-schema'
const fakeExt2Version = '0.7.15'

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

const testContextWithoutAppOption = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

const testContextWithAppOption = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post(
      '/actions/addon-attachments/resolve',
      {addon_attachment: fakeAddonAttachmentName, app: fakeHerokuAppName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
    ]))

describe('extension list command', () => {
  testContextWithoutAppOption
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
    .it('outputs the list of installed extensions when given only an add-on name', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
        `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n`)
    })

  testContextWithAppOption
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {
          extensions: [
            {name: fakeExt2, schema: fakeExt2Schema, version: fakeExt2Version},
            {name: fakeExt1, schema: fakeExt1Schema, version: fakeExt1Version},
          ],
        }))
    .command([
      'borealis-pg:extensions',
      '--addon',
      fakeAddonAttachmentName,
      '--app',
      fakeHerokuAppName,
    ])
    .it(
      'outputs the list of installed extensions when given add-on attachment and app names',
      ctx => {
        expect(ctx.stderr).to.endWith(
          `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n`)
        expect(ctx.stdout).to.equal(
          `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n` +
          `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n`)
      })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {extensions: []}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .it('outputs a warning if there are no extensions', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n` +
        ' ???   Warning: No extensions found\n')
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not done provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
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
    .nock(
      herokuApiBaseUrl,
      api => api
        .post('/oauth/authorizations')
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
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions'])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
