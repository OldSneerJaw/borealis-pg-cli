import color from '@heroku-cli/color'
import {baseHerokuApiUrl, baseBorealisPgApiUrl, expect, test} from '../../../test-utils'

const fakeBorealisPgAddonName = 'borealis-pg-my-fake-addon'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt2 = 'my-second-fake-pg-extension'
const pgExtensionColour = color.green

const commonTestContext = test.stdout()
  .stderr()
  .nock(
    baseHerokuApiUrl,
    api => api.post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 120,
      scope: ['read'],
    })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))

describe('extension installation command', () => {
  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`, {pgExtensionName: fakeExt1})
        .reply(201, {success: true}))
    .command(['borealis-pg:extensions:install', '--addon', fakeBorealisPgAddonName, fakeExt1])
    .it('installs the requested extension using full flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt1} for add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`, {pgExtensionName: fakeExt2})
        .reply(201, {success: true}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .it('installs the requested extension using abbreviated flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt2} for add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(400, {reason: 'Bad extension name'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(`${pgExtensionColour(fakeExt1)} is not a supported Postgres extension`)
    .it('exits with an error if the extension is not supported', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(404, {reason: 'Add-on does not exist'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} was not found or is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(409, {reason: 'Already installed'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(`Postgres extension ${pgExtensionColour(fakeExt1)} is already installed`)
    .it('exits with an error if the extension is already installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      baseBorealisPgApiUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(500, {reason: 'Something went wrong'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
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
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:install', fakeExt1])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName])
    .catch(/^Missing 1 required arg:/)
    .it('exits with an error if there is no Postgres extension argument', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
