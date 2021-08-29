import {expect} from './test-utils'
import tunnelServices from './tunnel-services'

describe('tunnel services', () => {
  it('should reference the global Node.js process', () => {
    expect(tunnelServices.nodeProcess).to.equal(process)
  })

  it('should have a valid SSH client factory', () => {
    const result = tunnelServices.sshClientFactory.create()

    expect(result.listenerCount('ready')).to.equal(0)
    expect(result.listenerCount('end')).to.equal(0)
    expect(result.listenerCount('close')).to.equal(0)
    expect(result.listenerCount('error')).to.equal(0)
  })

  it('should have a valid TCP server factory', () => {
    const result = tunnelServices.tcpServerFactory.create(_ => true)

    expect(result.listening).to.be.false
  })
})
