import {OAuthAuthorization} from '@heroku-cli/schema'

const baseUrl = 'https://pg-heroku-addon-api.borealis-data.com'

/**
 * Builds a Borealis Postgres API URL
 *
 * @param path The URL path
 *
 * @returns The full URL
 */
export function getBorealisPgApiUrl(path: string): string {
  return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`
}

/**
 * Builds an Authorization header value for a Borealis Postgres API request
 *
 * @param herokuAuthorization A previously-obtained Heroku OAuth authorization
 *
 * @returns The Authorization header value
 */
export function getBorealisPgAuthHeader(herokuAuthorization: OAuthAuthorization): string {
  if (!herokuAuthorization.access_token) {
    throw new Error('Log in to the Heroku CLI first!')
  } else {
    return `Bearer ${herokuAuthorization.access_token.token}`
  }
}
