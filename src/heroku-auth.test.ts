import {APIClient} from '@heroku-cli/command'
import * as Heroku from '@heroku-cli/schema'
import HTTP from 'http-call'
import {anything, deepEqual, instance, mock, verify, when} from 'ts-mockito'
import {createHerokuAuth, removeHerokuAuth} from './heroku-auth'
import {expect} from './test-utils'

describe('createHerokuAuth', () => {
  it('should request an authorization from the Heroku API', async () => {
    const fakeAuthorization = {id: 'my-authorization', access_token: {token: 'my-auth-token'}}
    const fakeResponse = new HTTP<Heroku.OAuthAuthorization>('https://api.heroku.com/foobar')
    fakeResponse.body = fakeAuthorization

    const mockHerokuApiClientType: APIClient = mock()
    when(mockHerokuApiClientType.post<Heroku.OAuthAuthorization>(anything(), anything()))
      .thenResolve(fakeResponse)
    const mockHerokuApiClient = instance(mockHerokuApiClientType)

    const result = await createHerokuAuth(mockHerokuApiClient)

    expect(result).to.equal(fakeAuthorization)

    verify(mockHerokuApiClientType.post<Heroku.OAuthAuthorization>(
      '/oauth/authorizations',
      deepEqual({
        body: {
          description: 'Borealis PG CLI plugin temporary auth token',
          expires_in: 120,
          scope: ['read'],
        },
      }))).once()
  })
})

describe('removeHerokuAuth', () => {
  it('should remove an authorization via the Heroku API', async () => {
    const fakeAuthorizationId = 'my-authorization'
    const fakeResponse = new HTTP<Heroku.OAuthAuthorization>('https://api.heroku.com/barfoo')

    const mockHerokuApiClientType: APIClient = mock()
    when(mockHerokuApiClientType.delete<Heroku.OAuthAuthorization>(anything()))
      .thenResolve(fakeResponse)
    const mockHerokuApiClient = instance(mockHerokuApiClientType)

    await removeHerokuAuth(mockHerokuApiClient, fakeAuthorizationId)

    verify(mockHerokuApiClientType.delete<Heroku.OAuthAuthorization>(
      `/oauth/authorizations/${fakeAuthorizationId}`))
      .once()
  })
})
