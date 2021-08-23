import {opendirSync} from 'fs'
import {join} from 'path'
import chai from 'chai'
import chaiString from 'chai-string'
import {glob} from 'glob'
import {test as oclifTest} from '@oclif/test'

const customizedChai = chai.use(chaiString)
export const expect = customizedChai.expect

export const test = oclifTest

export const baseHerokuApiUrl = 'https://api.heroku.com'
export const baseBorealisPgApiUrl = 'https://pg-heroku-addon-api.borealis-data.com'

// The following is a workaround for broken line number reporting in oclif commands (see
// https://github.com/oclif/test/issues/50 and https://github.com/oclif/oclif/issues/314)
test.stdout()
  .stderr()
  .timeout(15000)
  .it('performs the workaround for the oclif line number reporting bug', () => {
    const commandsDir = opendirSync(join(__dirname, 'commands'))
    const allTsFileNames = glob.sync('**/*.ts', {cwd: commandsDir.path})
    const testFileNames = glob.sync('**/*.test.ts', {cwd: commandsDir.path})

    allTsFileNames.forEach(filename => {
      if (!testFileNames.includes(filename)) {
        const commandPath = join(commandsDir.path, filename)
        require(commandPath)
      }
    })
  })
