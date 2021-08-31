import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeBorealisPgAddonName = 'borealis-pg-my-fake-addon'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt2 = 'my-second-fake-pg-extension'

const commonTestContext = test.stdout()
  .stderr()
  .nock(
    herokuApiBaseUrl,
    api => api.post('/oauth/authorizations', {
      description: 'Borealis PG CLI plugin temporary auth token',
      expires_in: 180,
      scope: ['read'],
    })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))

describe('extension removal command', () => {
  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt1}`)
        .reply(200, {success: true}))
    .command(['borealis-pg:extensions:remove', '--addon', fakeBorealisPgAddonName, fakeExt1])
    .it('removes the requested extension using full flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt2}`)
        .reply(200, {success: true}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt2])
    .it('removes the requested extension using abbreviated flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt2} from add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt1}`)
        .reply(404, {reason: 'Add-on does not exist'}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch('Add-on does not exist')
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt1}`)
        .reply(400, {reason: 'Extension has dependents'}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(new RegExp(`^Extension .*${fakeExt1}.* still has dependent extensions`))
    .it('exits with an error if the extension has dependents', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt2}`)
        .reply(404, {reason: 'Extension does not exist'}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch('Extension does not exist')
    .it('exits with an error if the extension is not installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt1}`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions/${fakeExt2}`)
        .reply(503, {reason: 'Something went wrong'}))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if the Borealis PG API indicates a server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .nock(
      herokuApiBaseUrl,
      api => api.post('/oauth/authorizations')
        .reply(201, {id: fakeHerokuAuthId})  // The access_token field is missing
        .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
        .reply(200))
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:remove', fakeExt2])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:remove', '-o', fakeBorealisPgAddonName])
    .catch(/^Missing 1 required arg:/)
    .it('exits with an error if there is no Postgres extension argument', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
