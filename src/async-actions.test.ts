import {expect} from 'chai'
import {applyActionSpinner} from './async-actions'
import {test} from './test-utils'

describe('applyActionSpinner', () => {
  test.stdout()
    .stderr()
    .it('resolves the given promise', async ctx => {
      const expectedResult = 'my-cool-result'
      const promise = Promise.resolve(expectedResult)

      const fakeMessage = 'my-cool-message'

      const result = await applyActionSpinner(fakeMessage, promise)

      expect(result).to.equal(expectedResult)
      expect(ctx.stderr).to.contain(fakeMessage)
    })

  test.stdout()
    .stderr()
    .it('rejects a promise that throws an error', async ctx => {
      const expectedError = new Error('my-bad-error')
      const promise = Promise.reject(expectedError)

      const fakeMessage = 'my-bad-message'

      expect(applyActionSpinner(fakeMessage, promise)).to.be.rejectedWith(expectedError)

      expect(ctx.stderr).to.contain(fakeMessage)
    })
})
