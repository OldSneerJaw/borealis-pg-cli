import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import globby from 'globby'
import path from 'path'
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
  .timeout(15_000)
  .it('performs the workaround for the oclif line number reporting bug', async () => {
    const commandsDirPath = path.join(__dirname, 'commands')
    const allTsFileNames = await globby('**/*.ts', {cwd: commandsDirPath})
    const testFileNames = await globby('**/*.test.ts', {cwd: commandsDirPath})

    for (const filename of allTsFileNames) {
      if (!testFileNames.includes(filename)) {
        const commandPath = path.join(commandsDirPath, filename)
        require(commandPath)
      }
    }
  })
