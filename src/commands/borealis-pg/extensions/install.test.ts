import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeAddonName = 'borealis-pg-my-fake-addon'
const fakeAddonAttachmentName = 'MY_COOL_DB'
const fakeHerokuAppName = 'my-fake-heroku-app'
const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'
const fakeExt1 = 'my-first-fake-pg-extension'
const fakeExt1Schema = 'my-first-fake-pg-ext-schema'
const fakeExt1Version = '1.11.111'
const fakeExt2 = 'my-second-fake-pg-extension'
const fakeExt2Schema = 'my-second-fake-pg-ext-schema'
const fakeExt2Version = '22.2.0'
const fakeExt3 = 'my-third-fake-pg-extension'
const fakeExt3Schema = 'my-third-fake-pg-ext-schema'
const fakeExt3Version = '3.3'
const pgExtensionColour = color.green

const baseTestContext = test.stdout()
  .stderr()
  .nock(
    herokuApiBaseUrl,
    api => api
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

describe('extension installation command', () => {
  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version}))
    .command(['borealis-pg:extensions:install', '--addon', fakeAddonName, fakeExt1])
    .it('installs the requested extension when given only an add-on name', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt1} for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n`)
    })

  testContextWithAppOption
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(201, {pgExtensionSchema: fakeExt2Schema, pgExtensionVersion: fakeExt2Version}))
    .command([
      'borealis-pg:extensions:install',
      '-o',
      fakeAddonAttachmentName,
      '-a',
      fakeHerokuAppName,
      fakeExt2,
    ])
    .it('installs the requested extension when given add-on attachment and app names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Installing Postgres extension ${fakeExt2} for add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal(
        `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n`)
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(409, {reason: 'Already installed!'}))
    .command([
      'borealis-pg:extensions:install',
      '--addon',
      fakeAddonName,
      '--suppress-conflict',
      fakeExt1,
    ])
    .it(
      'suppresses errors with the --suppress-conflict option when an extension is already installed',
      ctx => {
        expect(ctx.stderr).to.contain(
          `Installing Postgres extension ${fakeExt1} for add-on ${fakeAddonName}... !`)
        expect(ctx.stderr).to.contain(`Extension ${fakeExt1} is already installed`)
        expect(ctx.stdout).to.equal('')
      })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(201, {pgExtensionSchema: fakeExt2Schema, pgExtensionVersion: fakeExt2Version})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema, pgExtensionVersion: fakeExt3Version}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeAddonName, fakeExt3])
    .it('installs the extension and its dependencies when given only an add-on name', ctx => {
      expect(ctx.stdout).to.equal(
        `- ${fakeExt3} (version: ${fakeExt3Version}, schema: ${fakeExt3Schema})\n` +
        `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n`)
    })

  testContextWithAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(409, {reason: 'Already installed'})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema, pgExtensionVersion: fakeExt3Version})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version}))
    .command([
      'borealis-pg:extensions:install',
      '--recursive',
      '--addon',
      fakeAddonAttachmentName,
      '--app',
      fakeHerokuAppName,
      fakeExt1,
    ])
    .it(
      'installs the extension and its dependencies when given add-on attachment and app names',
      ctx => {
        expect(ctx.stdout).to.equal(
          `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
          `- ${fakeExt3} (version: ${fakeExt3Version}, schema: ${fakeExt3Schema})\n`)
      })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt3]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(201, {pgExtensionSchema: fakeExt3Schema, pgExtensionVersion: fakeExt3Version})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(201, {pgExtensionSchema: fakeExt2Schema, pgExtensionVersion: fakeExt2Version})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt1Schema, pgExtensionVersion: fakeExt1Version}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeAddonName, fakeExt1])
    .it('installs the extension and its dependencies recursively', ctx => {
      expect(ctx.stdout).to.equal(
        `- ${fakeExt1} (version: ${fakeExt1Version}, schema: ${fakeExt1Schema})\n` +
        `- ${fakeExt2} (version: ${fakeExt2Version}, schema: ${fakeExt2Schema})\n` +
        `- ${fakeExt3} (version: ${fakeExt3Version}, schema: ${fakeExt3Schema})\n`)
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt1]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(201, {pgExtensionSchema: fakeExt3Schema})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt2})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt1]}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeAddonName, fakeExt2])
    .catch(/^Unexpected error during installation/)
    .it('does not get stuck in infinite recursion if retrying after missing dependencies', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt2, fakeExt3]}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt1])
    .catch(new RegExp(
      `^Extension .*${fakeExt1}.* has one or more unsatisfied dependencies. All of its ` +
      `dependencies (.*${fakeExt2}.*, .*${fakeExt3}.*) must be installed.`))
    .it('exits with an error if the extension has missing dependencies', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt1})
        .reply(400, {reason: 'Missing dependencies', dependencies: [fakeExt3]})
        .post(
          `/heroku/resources/${fakeAddonName}/pg-extensions`,
          {pgExtensionName: fakeExt3})
        .reply(500, {reason: 'Internal server error'}))
    .command(['borealis-pg:extensions:install', '-r', '-o', fakeAddonName, fakeExt1])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error if installation of a dependency fails', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(400, {reason: 'Bad extension name'}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt1])
    .catch(`${pgExtensionColour(fakeExt1)} is not a supported Postgres extension`)
    .it('exits with an error if the extension is not supported', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(404, {reason: 'Add-on does not exist'}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(409, {reason: 'Already installed'}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt1])
    .catch(new RegExp(`^Extension .*${fakeExt1}.* is already installed`))
    .it('exits with an error if the extension is already installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(422, {reason: 'Not ready yet'}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt2])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppOption
    .nock(
      borealisPgApiBaseUrl,
      api => api.post(`/heroku/resources/${fakeAddonName}/pg-extensions`)
        .reply(500, {reason: 'Something went wrong'}))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt1])
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
        .reply(200)
        .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
        .reply(200, [
          {
            addon: {name: fakeAddonName},
            app: {name: fakeHerokuAppName},
            name: fakeAddonAttachmentName,
          },
        ]))
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName, fakeExt2])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:install', fakeExt1])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:install', '-o', fakeAddonName])
    .catch(/^Missing 1 required arg:/)
    .it('exits with an error if there is no Postgres extension argument', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
