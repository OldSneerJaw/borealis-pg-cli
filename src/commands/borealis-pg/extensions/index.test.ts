import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonName = 'borealis-pg-my-fake-addon'
const fakeAddonAttachmentName = 'MY_COOL_DB'
const fakeHerokuAppName = 'my-fake-heroku-app'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt2 = 'my-second-fake-pg-extension'

const baseTestContext = test.stdout()
  .stderr()
  .nock(herokuApiBaseUrl, api => api
    .post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read'],
    })
    .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
    .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
    .reply(200))

const testContextWithoutAppFlag = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

const testContextWithAppFlag = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post(
      '/actions/addon-attachments/resolve',
      {addon_attachment: fakeAddonAttachmentName, app: fakeHerokuAppName})
    .reply(200, [
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAddonAttachmentName},
    ]))

describe('extension list command', () => {
  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {extensions: [{name: fakeExt1}, {name: fakeExt2}]}))
    .command(['borealis-pg:extensions', '--addon', fakeAddonName])
    .it('outputs the list of installed extensions when given only an add-on name', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal(`${fakeExt1}\n${fakeExt2}\n`)
    })

  testContextWithAppFlag
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(200, {extensions: [{name: fakeExt1}, {name: fakeExt2}]}))
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
        expect(ctx.stdout).to.equal(`${fakeExt1}\n${fakeExt2}\n`)
      })

  testContextWithoutAppFlag
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

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.get(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions', '-o', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not done provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
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
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
