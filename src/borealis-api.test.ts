import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from './borealis-api'
import {borealisPgApiBaseUrl, expect} from './test-utils'

describe('getBorealisPgApiUrl', () => {
  it('should construct a URL where the path starts with a slash', () => {
    const fakePath = '/my/cool/path'

    const result = getBorealisPgApiUrl(fakePath)

    expect(result).to.equal(`${borealisPgApiBaseUrl}${fakePath}`)
  })

  it('should construct a URL where the path does not start with a slash', () => {
    const fakePath = 'my/good/path'

    const result = getBorealisPgApiUrl(fakePath)

    expect(result).to.equal(`${borealisPgApiBaseUrl}/${fakePath}`)
  })
})

describe('getBorealisPgAuthHeader', () => {
  it('should construct a valid Authorization header value when the access token exists', () => {
    const fakeAccessToken = {token: 'my-auth-token'}
    const fakeAuthorization = {id: 'my-authorization', access_token: fakeAccessToken}

    const result = getBorealisPgAuthHeader(fakeAuthorization)

    expect(result).to.equal(`Bearer ${fakeAccessToken.token}`)
  })

  it('should throw an error when the access token does not exist', () => {
    const fakeAuthorization = {id: 'my-authorization'}

    expect(() => getBorealisPgAuthHeader(fakeAuthorization)).to.throw()
  })
})
