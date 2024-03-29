import {OAuthAuthorization} from '@heroku-cli/schema'
import {borealisPgApiBaseUrl} from './command-components'

/**
 * Options to use when dealing with the Borealis API
 */
export const borealisApiOptions = {
  addonStatePollIntervalMs: 150_000, // 2.5 minutes
}

/**
 * Builds a Borealis Postgres API URL
 *
 * @param path The URL path
 *
 * @returns The full URL
 */
export function getBorealisPgApiUrl(path: string): string {
  return path.startsWith('/') ? `${borealisPgApiBaseUrl}${path}` : `${borealisPgApiBaseUrl}/${path}`
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
