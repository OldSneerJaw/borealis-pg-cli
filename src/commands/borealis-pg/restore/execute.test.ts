import {anything, capture, instance, mock, verify} from 'ts-mockito'
import {componentServices} from '../../../command-components'
import {herokuApiOptions} from '../../../heroku-api'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../../test-utils'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

const fakeSourceAddonId = 'bde71749-e560-42d7-b9ab-ccb6d91b17b5'
const fakeSourceAddonName = 'borealis-pg-my-fake-source-addon'

const fakeSourceAttachmentId = '8c76b180-afb4-41fe-8f8d-79bfc8d0e3fa'
const fakeSourceAttachmentName = 'MY_RADICAL_DB'

const fakeSourceHerokuAppId = '8fd84217-35ed-4e44-96dd-bfb8c4471721'
const fakeSourceHerokuAppName = 'my-fake-source-heroku-app'

const fakeSourcePlanId = '6380f9af-3952-407c-9bdf-f087bf134ccf'
const fakeSourcePlanName = 'my-fake-source-plan'

const fakeDbRestoreToken = 'my-cool-db-restore-token'
const fakeRestoreToTime = '2023-02-28T07:24:35.819-08:00'

const fakeDestinationHerokuAppId = '990c9431-0ac2-4e7b-a43e-a9fc45582f9a'
const fakeDestinationHerokuAppName = 'my-fake-destination-heroku-app'

const fakeNewPlanId = 'ca328398-c2f1-4dc1-bc59-93956e0c1811'
const fakeNewPlanName = 'my-fake-new-plan'

const fakeNewAddonName = 'my-nifty-new-addon'
const fakeNewAttachmentName = 'MY_RESTORED_DB'

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
      .reply(200)
      .get(`/apps/${fakeSourceHerokuAppName}/addons`)
      .reply(200, [
        {
          addon_service: {name: 'other-addon-service'},
          id: '8555365d-0164-4796-ba5a-a1517baee077',
          name: 'other-addon',
        },
        {addon_service: {name: 'borealis-pg'}, id: fakeSourceAddonId, name: fakeSourceAddonName},
      ])
      .get(`/addons/${fakeSourceAddonId}/addon-attachments`)
      .reply(200, [
        {
          addon: {id: fakeSourceAddonId, name: fakeSourceAddonName},
          app: {id: fakeSourceHerokuAppId, name: fakeSourceHerokuAppName},
          id: fakeSourceAttachmentId,
          name: fakeSourceAttachmentName,
        },
      ])
      .get(`/addons/${fakeSourceAddonName}`)
      .reply(
        200,
        {
          app: {id: fakeSourceHerokuAppId, name: fakeSourceHerokuAppName},
          plan: {id: fakeSourcePlanId, name: fakeSourcePlanName},
        }))

const defaultTestContext = baseTestContext
  .nock(
    borealisPgApiBaseUrl,
    {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
    api => api
      .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
      .reply(201, {restoreToken: fakeDbRestoreToken}))

describe('database restore execution command', () => {
  let originalAddonStatePollInterval: number
  let originalNotifier: typeof componentServices.notifier

  let mockNotifierType: typeof componentServices.notifier

  beforeEach(() => {
    originalAddonStatePollInterval = herokuApiOptions.addonStatePollIntervalMs
    originalNotifier = componentServices.notifier

    herokuApiOptions.addonStatePollIntervalMs = 10 // Prevents a long delay during tests that wait

    mockNotifierType = mock()
    componentServices.notifier = instance(mockNotifierType)
  })

  afterEach(() => {
    herokuApiOptions.addonStatePollIntervalMs = originalAddonStatePollInterval
    componentServices.notifier = originalNotifier
  })

  defaultTestContext
    .nock(
      herokuApiBaseUrl,
      api => api
        .post(
          `/apps/${fakeSourceHerokuAppName}/addons`,
          {
            config: {'restore-token': fakeDbRestoreToken},
            plan: `borealis-pg:${fakeSourcePlanName}`,
          })
        .reply(201, {name: fakeNewAddonName}))
    .command(['borealis-pg:restore:execute', '--app', fakeSourceHerokuAppName])
    .it('clones the add-on database with default options', ctx => {
      expect(ctx.stderr).to.contain(`Starting clone of add-on ${fakeSourceAddonName}... done`)
      expect(ctx.stderr).to.contain(
        `${fakeNewAddonName} is being created on ⬢ ${fakeSourceHerokuAppName} in the background`)

      verify(mockNotifierType.notify(anything())).never()
    })

  defaultTestContext
    .nock(
      herokuApiBaseUrl,
      api => api
        .get(`/addons/${fakeNewAddonName}`).times(4)
        .reply( // Responses while waiting for provisioning
          200,
          {
            app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
            plan: {id: fakeNewPlanId, name: fakeNewPlanName},
            state: 'provisioning',
          })
        .get(`/addons/${fakeNewAddonName}`).times(1)
        .reply( // Response when provisioning is finished
          200,
          {
            app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
            plan: {id: fakeNewPlanId, name: fakeNewPlanName},
            state: 'provisioned',
          })
        .post(
          `/apps/${fakeDestinationHerokuAppName}/addons`,
          {
            attachment: {name: fakeNewAttachmentName},
            config: {'restore-to-time': fakeRestoreToTime, 'restore-token': fakeDbRestoreToken},
            plan: `borealis-pg:${fakeNewPlanName}`,
          })
        .reply(201, {name: fakeNewAddonName}))
    .command([
      'borealis-pg:restore:execute',
      '--app',
      fakeSourceHerokuAppName,
      '--as',
      fakeNewAttachmentName,
      '--destination-app',
      fakeDestinationHerokuAppName,
      '--new-plan',
      fakeNewPlanName,
      '--restore-to-time',
      fakeRestoreToTime,
      '--wait',
    ])
    .it('restores the add-on database with all custom options', ctx => {
      expect(ctx.stderr).to.contain(`Starting restore of add-on ${fakeSourceAddonName}... done`)
      expect(ctx.stderr).to.contain(
        `Creating add-on ${fakeNewAddonName} on ⬢ ${fakeDestinationHerokuAppName}... done`)

      verify(mockNotifierType.notify(anything())).once()
      const [notification] = capture(mockNotifierType.notify).last()
      expect(notification).to.deep.equal({
        message: `Add-on ${fakeNewAddonName} is available`,
        sound: true,
        title: 'borealis-pg-cli',
        timeout: false,
      })
    })

  defaultTestContext
    .nock(
      herokuApiBaseUrl,
      api => api
        .post(
          `/apps/${fakeSourceHerokuAppName}/addons`,
          {
            config: {'restore-token': fakeDbRestoreToken},
            plan: `borealis-pg:${fakeNewPlanName}`,
          })
        .reply(201, {name: fakeNewAddonName}))
    .command([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-n',
      `borealis-pg:${fakeNewPlanName}`,
    ])
    .it('accepts a fully qualified plan name option', ctx => {
      expect(ctx.stderr).to.contain(`Starting clone of add-on ${fakeSourceAddonName}... done`)
      expect(ctx.stderr).to.contain(
        `${fakeNewAddonName} is being created on ⬢ ${fakeSourceHerokuAppName} in the background`)

      verify(mockNotifierType.notify(anything())).never()
    })

  defaultTestContext
    .nock(
      herokuApiBaseUrl,
      api => api
        .post(
          `/apps/${fakeSourceHerokuAppName}/addons`,
          {
            config: {'restore-token': fakeDbRestoreToken},
            plan: `borealis-pg:${fakeSourcePlanName}`,
          })
        .reply(201, {name: fakeNewAddonName})
        .get(`/addons/${fakeNewAddonName}`).times(2)
        .reply( // Responses while waiting for provisioning
          200,
          {
            app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
            plan: {id: fakeNewPlanId, name: fakeNewPlanName},
            state: 'provisioning',
          })
        .get(`/addons/${fakeNewAddonName}`).times(1)
        .reply( // Response when the add-on is concurrently deprovisioned
          200,
          {
            app: {id: fakeDestinationHerokuAppId, name: fakeDestinationHerokuAppName},
            plan: {id: fakeNewPlanId, name: fakeNewPlanName},
            state: 'deprovisioned',
          }))
    .command(['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName, '--wait'])
    .catch('Provisioning cancelled. The new add-on was deprovisioned.')
    .it('exits with an error when the new add-on is deprovisioned during execution', ctx => {
      expect(ctx.stderr).to.contain(`Starting clone of add-on ${fakeSourceAddonName}... done`)
      expect(ctx.stderr).to.contain(
        `Creating add-on ${fakeNewAddonName} on ⬢ ${fakeSourceHerokuAppName}... !`)

      verify(mockNotifierType.notify(anything())).once()
      const [notification] = capture(mockNotifierType.notify).last()
      expect(notification).to.deep.equal({
        message: `Add-on ${fakeNewAddonName} was cancelled`,
        sound: true,
        title: 'borealis-pg-cli',
        timeout: false,
      })
    })

  test.stdout()
    .stderr()
    .command([
      'borealis-pg:restore:execute',
      '-a',
      fakeSourceHerokuAppName,
      '-t',
      'January 15, 2023 12:07:41pm',
    ])
    .catch(/.*Expected an ISO 8601 date\/time string.*/)
    .it('rejects a restore to time that is not an ISO 8601 date/time string', () => {
      verify(mockNotifierType.notify(anything())).never()
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
        .reply(400, {reason: 'Multi-tenant plans are not supported!'}))
    .command(['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])
    .catch('Multi-tenant plans are not supported!')
    .it('exits with an error when the add-on has a multi-tenant plan', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
        .reply(404, {reason: 'Not found!'}))
    .command(['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])
    .catch('Add-on is not a Borealis Isolated Postgres add-on')
    .it('exits with an error when the add-on does not exist', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
        .reply(422, {reason: 'Still provisioning!'}))
    .command(['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])
    .catch('Add-on is not finished provisioning')
    .it('exits with an error when the add-on is not fully provisioned', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  baseTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api
        .post(`/heroku/resources/${fakeSourceAddonName}/restore-tokens`)
        .reply(500, {reason: 'Internal server error!'}))
    .command(['borealis-pg:restore:execute', '-a', fakeSourceHerokuAppName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is a server-side error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
