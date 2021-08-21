import {APIClient} from '@heroku-cli/command'
import * as Heroku from '@heroku-cli/schema'

/**
 * Creates a new, short-lived Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 */
export async function createHerokuAuth(herokuApiClient: APIClient): Promise<Heroku.OAuthAuthorization> {
  const response = await herokuApiClient.post<Heroku.OAuthAuthorization>(
    '/oauth/authorizations',
    {
      body: {
        description: 'Borealis PG CLI plugin temporary auth token',
        expires_in: 120,
        scope: ['read'],
      },
    })

  return response.body
}

/**
 * Removes a Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 * @param authId The ID of the Heroku OAuth authorization
 */
export async function removeHerokuAuth(herokuApiClient: APIClient, authId: string) {
  await herokuApiClient.delete<Heroku.OAuthAuthorization>(`/oauth/authorizations/${authId}`)
}
