import index from '.'
import {expect} from './test-utils'

describe('index', () => {
  it('should be empty', () => {
    expect(index).to.deep.equal({})
  })
})
