import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeBorealisPgAddonName = 'borealis-pg-my-fake-addon'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-pg-ext-schema'
const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-pg-ext-schema'
const fakeExt3 = 'my-third-fake-pg-extension'
const fakeExt3Schema = 'my-third-fake-pg-ext-schema'
const pgExtensionColour = color.green

const commonTestContext = test.stdout()
  .stderr()
  .nock(
    herokuApiBaseUrl,
    api => api
      .post('/oauth/authorizations', {
        description: 'Borealis PG CLI plugin temporary auth token',
        expires_in: 180,
        scope: ['read'],
      })
      .reply(201, {id: fakeHerokuAuthId, access_token: {token: fakeHerokuAuthToken}})
      .delete(`/oauth/authorizations/${fakeHerokuAuthId}`)
      .reply(200))

describe('extension installation command', () => {
  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema}))
    .command(['borealis-pg:extensions:install', '--addon', fakeBorealisPgAddonName, fakeExt1])
    .it('installs the requested extension using full flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt1} for add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        'Database schemas for installed extensions:\n' +
        `- ${fakeExt1}: ${fakeExt1Schema}\n`)
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(201, {pgExtensionSchema: fakeExt2Schema}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .it('installs the requested extension using abbreviated flag names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt2} for add-on ${fakeBorealisPgAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        'Database schemas for installed extensions:\n' +
        `- ${fakeExt2}: ${fakeExt2Schema}\n`)
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2]})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(201, {pgExtensionSchema: fakeExt2Schema})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema}))
    .command([
      'borealis-pg:extensions:install',
      '--recursive',
      '--addon',
      fakeBorealisPgAddonName,
      fakeExt3,
    ])
    .it('installs the extension and its dependencies recursively using full flag names', ctx => {
      expect(ctx.stdout).to.equal(
        'Database schemas for installed extensions:\n' +
        `- ${fakeExt3}: ${fakeExt3Schema}\n` +
        `- ${fakeExt2}: ${fakeExt2Schema}\n`)
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(409, {reason: 'Already installed'})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeBorealisPgAddonName, fakeExt1])
    .it(
      'installs the extension and its dependencies recursively using abbreviated flag names',
      ctx => {
        expect(ctx.stdout).to.equal(
          'Database schemas for installed extensions:\n' +
          `- ${fakeExt1}: ${fakeExt1Schema}\n` +
          `- ${fakeExt3}: ${fakeExt3Schema}\n`)
      })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(new RegExp(
      `^Extension .*${fakeExt1}.* has one or more unsatisfied dependencies. All of its ` +
      `dependencies (.*${fakeExt2}.*, .*${fakeExt3}.*) must be installed.`))
    .it('exits with an error if the extension has missing dependencies', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt3]})
        .post(
          `/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(500, {reason: 'Internal server error'}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if installation of a dependency fails', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(400, {reason: 'Bad extension name'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(`${pgExtensionColour(fakeExt1)} is not a supported Postgres extension`)
    .it('exits with an error if the extension is not supported', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(404, {reason: 'Add-on does not exist'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} was not found or is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(409, {reason: 'Already installed'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt1])
    .catch(new RegExp(`^Extension .*${fakeExt1}.* is already installed`))
    .it('exits with an error if the extension is already installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeBorealisPgAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions:install', '-o', fakeBorealisPgAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeBorealisPgAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  commonTestContext
    .nock(
      borealisPgApiBaseUrl,
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
      herokuApiBaseUrl,
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
