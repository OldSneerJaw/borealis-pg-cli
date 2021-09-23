import {join} from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import {glob} from 'glob'
import {test as oclifTest} from '@oclif/test'

const customizedChai = chai.use(chaiString).use(chaiAsPromised)
export const expect = customizedChai.expect

export const test = oclifTest

export const herokuApiBaseUrl = 'https://api.heroku.com'
export const borealisPgApiBaseUrl = 'https://pg-heroku-addon-api.borealis-data.com'

// The following is a workaround for broken line number reporting in oclif commands (see
// https://github.com/oclif/test/issues/50 and https://github.com/oclif/oclif/issues/314)
test.stdout()
  .stderr()
  .timeout(15000)
  .it('performs the workaround for the oclif line number reporting bug', () => {
    const commandsDirPath = join(__dirname, 'commands')
    const allTsFileNames = glob.sync('**/*.ts', {cwd: commandsDirPath})
    const testFileNames = glob.sync('**/*.test.ts', {cwd: commandsDirPath})

    allTsFileNames.forEach(filename => {
      if (!testFileNames.includes(filename)) {
        const commandPath = join(commandsDirPath, filename)
        require(commandPath)
      }
    })
  })
