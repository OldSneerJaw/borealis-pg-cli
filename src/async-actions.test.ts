import {applyActionSpinner} from './async-actions'
import {expect, test} from './test-utils'

describe('applyActionSpinner', () => {
  test.stdout()
    .stderr()
    .it('resolves the given promise', async () => {
      const expectedResult = 'my-cool-result'
      const promise = Promise.resolve(expectedResult)

      const result = await applyActionSpinner('', promise)

      expect(result).to.equal(expectedResult)
    })

  test.stdout()
    .stderr()
    .it('rejects a promise that throws an error', async () => {
      const expectedError = new Error('my-bad-error')
      const promise = Promise.reject(expectedError)

      await expect(applyActionSpinner('', promise)).to.be.rejectedWith(expectedError)
    })

  test.stdout()
    .stderr()
    .it('outputs the specified message for a successful execution', async ctx => {
      const fakeMessage = 'my-excellent-message'

      await applyActionSpinner(fakeMessage, Promise.resolve('my-excellent-result'))

      expect(ctx.stderr).to.contain(fakeMessage)
    })

  test.stdout()
    .stderr()
    .it('outputs the specified message for a failed execution', async ctx => {
      const expectedError = new Error('error')
      const fakeMessage = 'my-terrible-message'

      await expect(applyActionSpinner(fakeMessage, Promise.reject(expectedError))).to.be.rejected

      expect(ctx.stderr).to.contain(fakeMessage)
    })
})
