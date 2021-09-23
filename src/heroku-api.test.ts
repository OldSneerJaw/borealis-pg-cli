import {APIClient} from '@heroku-cli/command'
import {HerokuAPIError} from '@heroku-cli/command/lib/api-client'
import {AddOnAttachment, OAuthAuthorization} from '@heroku-cli/schema'
import HTTP, {HTTPError} from 'http-call'
import {anyString, anything, deepEqual, instance, mock, verify, when} from 'ts-mockito'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from './heroku-api'
import {expect} from './test-utils'

describe('createHerokuAuth', () => {
  const fakeAuthorization = {id: 'my-authorization', access_token: {token: 'my-auth-token'}}
  let fakeResponse: HTTP<OAuthAuthorization>

  let mockHerokuApiClientType: APIClient
  let mockHerokuApiClientInstance: APIClient

  beforeEach(() => {
    fakeResponse = new HTTP<OAuthAuthorization>('https://api.heroku.com/foobar')
    fakeResponse.body = fakeAuthorization

    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<OAuthAuthorization>(anyString(), anything()))
      .thenResolve(fakeResponse)
    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)
  })

  it('requests an authorization without the "identity" scope by default', async () => {
    const result = await createHerokuAuth(mockHerokuApiClientInstance)

    expect(result).to.equal(fakeAuthorization)

    verify(mockHerokuApiClientType.post<OAuthAuthorization>(
      '/oauth/authorizations',
      deepEqual({
        body: {
          description: 'Borealis PG CLI plugin temporary auth token',
          expires_in: 180,
          scope: ['read'],
        },
      }))).once()
  })

  it('requests an authorization with the "identity" scope', async () => {
    const result = await createHerokuAuth(mockHerokuApiClientInstance, true)

    expect(result).to.equal(fakeAuthorization)

    verify(mockHerokuApiClientType.post<OAuthAuthorization>(
      '/oauth/authorizations',
      deepEqual({
        body: {
          description: 'Borealis PG CLI plugin temporary auth token',
          expires_in: 180,
          scope: ['read', 'identity'],
        },
      }))).once()
  })
})

describe('fetchAddonAttachmentInfo', () => {
  const fakeAddonName = 'my-good-addon'
  const fakeAppName = 'my-neat-app'
  const fakeAddonAttachmentName = 'MY_GREAT_DB'

  let fakeSuccessResponse: HTTP<AddOnAttachment>

  let mockHerokuApiClientType: APIClient
  let mockHerokuApiClientInstance: APIClient

  beforeEach(() => {
    fakeSuccessResponse = new HTTP<AddOnAttachment>('https://api.borealis-data.com/foobaz')

    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<AddOnAttachment>(anyString(), anything()))
      .thenResolve(fakeSuccessResponse)

    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)
  })

  it('returns attachments for an add-on without an app name', async () => {
    const fakeAttachments: AddOnAttachment[] = [{id: '#1'}]
    fakeSuccessResponse.body = fakeAttachments

    const results = await fetchAddonAttachmentInfo(mockHerokuApiClientInstance, fakeAddonName)

    expect(results).to.deep.equal(fakeAttachments)

    verify(mockHerokuApiClientType.post<AddOnAttachment>(
      '/actions/addon-attachments/resolve',
      deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
  })

  it('returns attachments for an add-on attachment and app', async () => {
    const fakeAttachments: AddOnAttachment[] = [{id: '#2'}, {id: '#3'}]
    fakeSuccessResponse.body = fakeAttachments

    const results = await fetchAddonAttachmentInfo(
      mockHerokuApiClientInstance,
      fakeAddonAttachmentName,
      fakeAppName)

    expect(results).to.deep.equal(fakeAttachments)

    verify(mockHerokuApiClientType.post<AddOnAttachment>(
      '/actions/addon-attachments/resolve',
      deepEqual({body: {addon_attachment: fakeAddonAttachmentName, app: fakeAppName}})))
      .once()
  })

  it('returns null for a 404 response', async () => {
    const fakeHttp404Response: any = {body: {message: 'Not found'}, statusCode: 404}

    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<AddOnAttachment>(anyString(), anything()))
      .thenReject(new HerokuAPIError(new HTTPError(fakeHttp404Response)))

    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)

    const results = await fetchAddonAttachmentInfo(mockHerokuApiClientInstance, fakeAddonName)

    expect(results).to.be.null

    verify(mockHerokuApiClientType.post<AddOnAttachment>(
      '/actions/addon-attachments/resolve',
      deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
  })

  it('throws an error for a server error', async () => {
    const fakeHttp500Response: any = {body: {message: 'Server error!'}, statusCode: 500}

    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<AddOnAttachment>(anyString(), anything()))
      .thenReject(new HerokuAPIError(new HTTPError(fakeHttp500Response)))

    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)

    expect(fetchAddonAttachmentInfo(mockHerokuApiClientInstance, fakeAddonName))
      .to
      .be
      .rejectedWith(HerokuAPIError)

    verify(mockHerokuApiClientType.post<AddOnAttachment>(
      '/actions/addon-attachments/resolve',
      deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
  })

  it('throws an error for a client error', async () => {
    mockHerokuApiClientType = mock()
    when(mockHerokuApiClientType.post<AddOnAttachment>(anyString(), anything()))
      .thenReject(new Error())

    mockHerokuApiClientInstance = instance(mockHerokuApiClientType)

    expect(fetchAddonAttachmentInfo(mockHerokuApiClientInstance, fakeAddonName)).to.be.rejected

    verify(mockHerokuApiClientType.post<AddOnAttachment>(
      '/actions/addon-attachments/resolve',
      deepEqual({body: {addon_attachment: fakeAddonName}})))
      .once()
  })
})

describe('removeHerokuAuth', () => {
  it('removes an authorization via the Heroku API', async () => {
    const fakeAuthorizationId = 'my-authorization'
    const fakeResponse = new HTTP<OAuthAuthorization>('https://api.heroku.com/barfoo')

    const mockHerokuApiClientType: APIClient = mock()
    when(mockHerokuApiClientType.delete<OAuthAuthorization>(anyString()))
      .thenResolve(fakeResponse)
    const mockHerokuApiClient = instance(mockHerokuApiClientType)

    await removeHerokuAuth(mockHerokuApiClient, fakeAuthorizationId)

    verify(
      mockHerokuApiClientType
        .delete<OAuthAuthorization>(`/oauth/authorizations/${fakeAuthorizationId}`))
      .once()
  })
})
