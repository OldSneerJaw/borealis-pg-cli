import color from '@heroku-cli/color'
import {consoleColours} from '../../../command-components'
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

describe('extension removal command', () => {
  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(200, {success: true}))
    .command([
      'borealis-pg:extensions:remove',
      '--confirm',
      fakeExt1,
      '--addon',
      fakeAddonName,
      fakeExt1,
    ])
    .it('removes the requested extension when given only an add-on name', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  testContextWithAppFlag
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
        .reply(200, {success: true}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-a',
      fakeHerokuAppName,
      '-o',
      fakeAddonAttachmentName,
      fakeExt2,
    ])
    .it('removes the requested extension when given add-on attachment and app names', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt2} from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(200, {success: true}))
    .stdin(` ${fakeExt1} `, 250) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:extensions:remove', '-o', fakeAddonName, fakeExt1])
    .it('removes the requested extension after a successful confirmation prompt', ctx => {
      expect(ctx.stderr).to.endWith(
        `Removing Postgres extension ${fakeExt1} from add-on ${fakeAddonName}... done\n`)
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .stdin('WRONG!', 250) // Fakes keyboard input for the confirmation prompt
    .command(['borealis-pg:extensions:remove', '-o', fakeAddonName, fakeExt2])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the confirmation prompt fails', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      'WRONG!',
      '-o',
      fakeAddonName,
      fakeExt2,
    ])
    .catch(/^Invalid confirmation provided/)
    .it('exits with an error if the confirm flag has the wrong value', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(404, {reason: 'Add-on does not exist', resourceType: 'addon'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-o',
      fakeAddonName,
      fakeExt1,
    ])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error if the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(400, {reason: 'Extension has dependents'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-o',
      fakeAddonName,
      fakeExt1,
    ])
    .catch(new RegExp(`^Extension .*${fakeExt1}.* still has dependent extensions`))
    .it('exits with an error if the extension has dependents', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
        .reply(404, {reason: 'Extension does not exist', resourceType: 'extension'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-o',
      fakeAddonName,
      fakeExt2,
    ])
    .catch(`Extension ${consoleColours.pgExtension(fakeExt2)} is not installed`)
    .it('exits with an error if the extension is not installed', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt1}`)
        .reply(422, {reason: 'Not ready yet'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-o',
      fakeAddonName,
      fakeExt1,
    ])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error if the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  testContextWithoutAppFlag
    .nock(
      borealisPgApiBaseUrl,
      api => api.delete(`/heroku/resources/${fakeAddonName}/pg-extensions/${fakeExt2}`)
        .reply(503, {reason: 'Something went wrong'}))
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt2,
      '-o',
      fakeAddonName,
      fakeExt2,
    ])
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
    .command([
      'borealis-pg:extensions:remove',
      '-c',
      fakeExt1,
      '-o',
      fakeAddonName,
      fakeExt1,
    ])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error if there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:remove', '-c', fakeExt2, fakeExt2])
    .catch(/^Missing required flag:/)
    .it('exits with an error if there is no add-on name flag', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:extensions:remove', '-o', fakeAddonName])
    .catch(/^Missing 1 required arg:/)
    .it('exits with an error if there is no Postgres extension argument', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
