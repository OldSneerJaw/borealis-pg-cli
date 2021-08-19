import {join} from 'path'
import chai from 'chai'
import chaiString from 'chai-string'
import {test as oclifTest} from '@oclif/test'

const customizedChai = chai.use(chaiString)
export const expect = customizedChai.expect

export const test = oclifTest

export const baseHerokuApiUrl = 'https://api.heroku.com'
export const baseBorealisPgApiUrl = 'https://pg-heroku-addon-api.borealis-data.com'

// The following code is a workaround for broken line number reporting in oclif commands (see
// https://github.com/oclif/test/issues/50 and https://github.com/oclif/oclif/issues/314)
function loadCommand(command: string) {
  const relativePath = command.split(':')
  const fullPath = join(__dirname, 'commands', ...relativePath)
  require(fullPath).default
}

test.stdout()
  .stderr()
  .it('performs the workaround for the oclif line number reporting bug', async () => {
    loadCommand('borealis-pg:extensions')
    loadCommand('borealis-pg:extensions:install')
    loadCommand('borealis-pg:extensions:remove')
  })
