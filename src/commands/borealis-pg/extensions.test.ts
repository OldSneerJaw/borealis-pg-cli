import color from '@heroku-cli/color'
import {baseHerokuApiUrl, baseBorealisPgApiUrl, expect, test} from '../../test-utils'

const fakeBorealisPgAddonName = 'borealis-pg-my-fake-addon'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt2 = 'my-second-fake-pg-extension'

const commonTestContext = test.stdout()
  .stderr()
  .nock(baseHerokuApiUrl, api =>
    api.post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 120,
      scope: ['read'],
    })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))

describe('extension list command', () => {
  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(200, {extensions: [{name: fakeExt1}, {name: fakeExt2}]}))
    .command(['borealis-pg:extensions', '--addon', fakeBorealisPgAddonName])
    .it('outputs the list of installed extensions', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal(`${fakeExt1}\n${fakeExt2}\n`)
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.get(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(200, {extensions: []}))
    .command(['borealis-pg:extensions', '-o', fakeBorealisPgAddonName])
    .it('outputs a warning if there are no extensions', ctx => {
      expect(ctx.stderr).to.endWith(
        `Fetching Postgres extension list for add-on ${fakeBorealisPgAddonName}... done\n` +
        ' ›   Warning: No extensions found\n')
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.get(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(404, {reason: 'Does not exist'}))
    .command(['borealis-pg:extensions', '-o', fakeBorealisPgAddonName])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} was not found or is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.get(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions', '-o', fakeBorealisPgAddonName])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not done provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.get(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(500, {reason: 'Something went wrong'}))
    .command(['borealis-pg:extensions', '-o', fakeBorealisPgAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .nock(
      baseHerokuApiUrl,
      api => api.post('/oauth/authorizations')
        .reply(201, {id: fakeHerokuAuthId})  // The access_token field is missing
        .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
        .reply(200))
    .command(['borealis-pg:extensions', '-o', fakeBorealisPgAddonName])
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
