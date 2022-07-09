import color from '@heroku-cli/color'
import {borealisPgApiBaseUrl, expect, herokuApiBaseUrl, test} from '../../test-utils'

const fakeAddonName = 'my-super-neat-fake-addon'
const fakeAttachmentName = 'MY_SUPER_NEAT_FAKE_ADDON'
const fakeHerokuAppName = 'my-super-neat-fake-app'

const fakeAppDbName = 'my-super-neat-fake-app-db'
const fakeCreatedAt = '2022-06-30T23:52:14.019+00:00'
const fakePlanName = 'my-super-neat-fake-plan'
const fakePostgresVersion = '14.4'
const fakeStorageComplianceDeadline = '2022-07-08T18:40:38.193-07:00'

const fakeHerokuAuthToken = 'my-fake-heroku-auth-token'
const fakeHerokuAuthId = 'my-fake-heroku-auth'

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

const defaultTestContext = baseTestContext
  .nock(herokuApiBaseUrl, api => api
    .post('/actions/addon-attachments/resolve', {addon_attachment: fakeAddonName})
    .reply(200, [
      {
        addon: {name: fakeAddonName},
        app: {name: fakeHerokuAppName},
        name: fakeAttachmentName,
      },
      {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: 'DATABASE'},
    ]))

describe('add-on info command', () => {
  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 21_474_836_480,
            dbStorageUsageBytes: 4_582_038_115,
            dbTenancyType: 'isolated',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'us-east-1',
            replicaQuantity: 2,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'ok',
          }))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .it('displays details of a single tenant add-on', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: US (N. Virginia)')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Single Tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 2')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 268_435_456,
            dbStorageUsageBytes: 251_274_003,
            dbTenancyType: 'shared',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'eu-west-1',
            replicaQuantity: 0,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'proximity-warning',
          }))
    .command(['borealis-pg:info', '-o', fakeAddonName])
    .it('displays details of a multi-tenant add-on', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: EU (Ireland)')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Multi-tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 0.25 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 0.234 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: Proximity Warning')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 21_474_836_480,
            dbStorageUsageBytes: 4_582_038_115,
            dbTenancyType: 'isolated',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'ap-southeast-2',
            replicaQuantity: 0,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'ok',
          }))
    .command(['borealis-pg', '--addon', fakeAddonName])
    .it('displays details when called using the borealis-pg index alias', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: Sydney')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Single Tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 536_870_912_000,
            dbStorageUsageBytes: 92_234_422_682,
            dbTenancyType: 'hyper-tenant',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'mars-orbit-1',
            replicaQuantity: 1,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'super-duper',
          }))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .it('displays raw values for custom values in the response', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: mars-orbit-1')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: hyper-tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 500 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 85.9 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 1')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: super-duper')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 21_474_836_480,
            dbStorageUsageBytes: 4_582_038_115,
            dbTenancyType: 'isolated',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'ap-northeast-1',
            replicaQuantity: 0,
            storageComplianceDeadline: fakeStorageComplianceDeadline,
            storageComplianceStatus: 'violating',
          }))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .it('displays details for an add-on with a storage compliance violation', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: Tokyo')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Single Tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: Violating')
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Storage Compliance Deadline: ${new Date(fakeStorageComplianceDeadline).toISOString()}`)
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 644_245_094,
            dbStorageUsageBytes: 139_586_437,
            dbTenancyType: 'isolated',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'eu-central-1',
            replicaQuantity: 0,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'restricted',
          }))
    .command(['borealis-pg:info', '-o', fakeAddonName])
    .it('displays details for an add-on with a storage compliance status of restricted', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: Frankfurt')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Single Tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 0.60 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 0.130 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 0')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(
        `Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: Restricted')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
    })

  baseTestContext
    .nock(herokuApiBaseUrl, api => api
      .post(
        '/actions/addon-attachments/resolve',
        {addon_attachment: fakeAttachmentName, app: fakeHerokuAppName})
      .reply(200, [
        {addon: {name: fakeAddonName}, app: {name: fakeHerokuAppName}, name: fakeAttachmentName},
      ]))
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(
          200,
          {
            addonName: fakeAddonName,
            appDbName: fakeAppDbName,
            createdAt: fakeCreatedAt,
            dbStorageMaxBytes: 21_474_836_480,
            dbStorageUsageBytes: 4_582_038_115,
            dbTenancyType: 'isolated',
            planName: fakePlanName,
            postgresVersion: fakePostgresVersion,
            region: 'us-west-2',
            replicaQuantity: 1,
            storageComplianceDeadline: null,
            storageComplianceStatus: 'ok',
          }))
    .command(['borealis-pg:info', '--app', fakeHerokuAppName, '--addon', fakeAttachmentName])
    .it('displays details when app name and add-on attachment name are provided', ctx => {
      expect(ctx.stdout).to.containIgnoreSpaces(`Add-on Name: ${fakeAddonName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Plan Name: ${fakePlanName}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Region: Oregon')
      expect(ctx.stdout).to.containIgnoreSpaces('Environment: Single Tenant')
      expect(ctx.stdout).to.containIgnoreSpaces(`PostgreSQL Version: ${fakePostgresVersion}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Maximum Storage: 20 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Used: 4.3 GiB')
      expect(ctx.stdout).to.containIgnoreSpaces('Read-only Replicas: 1')
      expect(ctx.stdout).to.containIgnoreSpaces(`App DB Name: ${fakeAppDbName}`)
      expect(ctx.stdout).to.containIgnoreSpaces(`Created At: ${new Date(fakeCreatedAt).toISOString()}`)
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Status: OK')
      expect(ctx.stdout).to.containIgnoreSpaces('Storage Compliance Deadline: N/A')
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
            name: fakeAttachmentName,
          },
        ]))
    .command(['borealis-pg:info', '-o', fakeAddonName])
    .catch('Log in to the Heroku CLI first!')
    .it('exits with an error when there is no Heroku access token', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  test.stdout()
    .stderr()
    .command(['borealis-pg:info'])
    .catch(/^Missing required flag:/)
    .it('exits with an error when there is no add-on name option', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(404, {reason: 'Not found'}))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not a Borealis Isolated Postgres add-on`)
    .it('exits with an error when the add-on was not found', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(422, {reason: 'Not finished provisioning'}))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .catch(`Add-on ${color.addon(fakeAddonName)} is not finished provisioning`)
    .it('exits with an error when the add-on is still provisioning', ctx => {
      expect(ctx.stdout).to.equal('')
    })

  defaultTestContext
    .nock(
      borealisPgApiBaseUrl,
      {reqheaders: {authorization: `Bearer ${fakeHerokuAuthToken}`}},
      api => api.get(`/heroku/resources/${fakeAddonName}`)
        .reply(500, {reason: 'Server error'}))
    .command(['borealis-pg:info', '--addon', fakeAddonName])
    .catch('Add-on service is temporarily unavailable. Try again later.')
    .it('exits with an error when there is an API server error', ctx => {
      expect(ctx.stdout).to.equal('')
    })
})
