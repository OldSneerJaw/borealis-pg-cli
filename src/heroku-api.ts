import {APIClient} from '@heroku-cli/command'
import {AddOnAttachment, OAuthAuthorization} from '@heroku-cli/schema'
import {HTTPError} from 'http-call'

/**
 * Creates a new, short-lived Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 * @param includeIdentityScope Whether the authorization should include the "identity" scope
 */
export async function createHerokuAuth(
  herokuApiClient: APIClient,
  includeIdentityScope = false): Promise<OAuthAuthorization> {
  const scopes = includeIdentityScope ? ['read', 'identity'] : ['read']
  const response = await herokuApiClient.post<OAuthAuthorization>(
    '/oauth/authorizations',
    {
      body: {
        description: 'Borealis PG CLI plugin temporary auth token',
        expires_in: 180,
        scope: scopes,
      },
    })

  return response.body
}

/**
 * Retrieves add-on attachment info for the specified add-on or attachment.
 *
 * @param herokuApiClient The Heroku API client
 * @param addonOrAttachment The name or ID of an add-on or its attachment
 * @param appName The name of an app to which the add-on is attached
 */
export async function fetchAddonAttachmentInfo(
  herokuApiClient: APIClient,
  addonOrAttachment: string,
  appName?: string): Promise<AddOnAttachment[] | null> {
  const baseRequestBody = {addon_attachment: addonOrAttachment}
  const requestBody = appName ? {app: appName, ...baseRequestBody} : baseRequestBody

  try {
    const response = await herokuApiClient.post<AddOnAttachment[]>(
      '/actions/addon-attachments/resolve',
      {body: requestBody})

    return response.body
  } catch (error: any) {
    const actualError = (error.http instanceof HTTPError) ? error.http : error
    if (actualError instanceof HTTPError && actualError.statusCode === 404) {
      return null
    } else {
      throw error
    }
  }
}

/**
 * Removes a Heroku OAuth authorization
 *
 * @param herokuApiClient The Heroku API client
 * @param authId The ID of the Heroku OAuth authorization
 */
export async function removeHerokuAuth(herokuApiClient: APIClient, authId: string) {
  await herokuApiClient.delete<OAuthAuthorization>(`/oauth/authorizations/${authId}`)
}
