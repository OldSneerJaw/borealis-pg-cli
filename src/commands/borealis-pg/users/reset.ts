import color from '@heroku-cli/color'
import {Command} from '@heroku-cli/command'
import {HTTP, HTTPError} from 'http-call'
import {applyActionSpinner} from '../../../async-actions'
import {getBorealisPgApiUrl, getBorealisPgAuthHeader} from '../../../borealis-api'
import {
  addonOptionName,
  appOptionName,
  cliOptions,
  consoleColours,
  formatCliOptionName,
  processAddonAttachmentInfo,
} from '../../../command-components'
import {createHerokuAuth, fetchAddonAttachmentInfo, removeHerokuAuth} from '../../../heroku-api'

const cliCmdColour = consoleColours.cliCmdName

export default class ResetUsersCommand extends Command {
  static description =
    `resets all database credentials for a Borealis Isolated Postgres add-on

The Heroku application's database user roles will be assigned new, random
passwords and the application's config vars will be updated immediately and
automatically with the new credentials. Generally this will happen with no
visible disruption for the Heroku application's end users, but there is a very
brief window in which the database may reject new database connections
(typically for only a few seconds), so plan accordingly.

Any active personal database user roles will be deactivated by this operation,
which means that anyone that is currently connected to the database with a
personal user role will be immediately disconnected. Rest assured that any
tables, indexes, views or other objects that are are owned by a personal user
role will not be affected (the user roles and the objects they own will
continue to exist). A personal user role that has been deactivated will be
automatically reactivated when the affected user runs one of the
${cliCmdColour('borealis-pg:psql')} or ${cliCmdColour('borealis-pg:tunnel')} commands (or ${cliCmdColour('borealis-pg:run')} with the
${formatCliOptionName('personal-user')} option).`

  static flags = {
    [addonOptionName]: cliOptions.addon,
    [appOptionName]: cliOptions.app,
  }

  async run() {
    const {flags} = this.parse(ResetUsersCommand)
    const authorization = await createHerokuAuth(this.heroku)
    const attachmentInfos = await fetchAddonAttachmentInfo(this.heroku, flags.addon, flags.app)
    const {addonName} = processAddonAttachmentInfo(
      attachmentInfos,
      {addonOrAttachment: flags.addon, app: flags.app},
      this.error)
    try {
      await applyActionSpinner(
        `Resetting all database credentials for add-on ${color.addon(addonName)}`,
        HTTP.delete<{success: boolean}>(
          getBorealisPgApiUrl(`/heroku/resources/${addonName}/db-users/credentials`),
          {headers: {Authorization: getBorealisPgAuthHeader(authorization)}}),
      )
    } finally {
      await removeHerokuAuth(this.heroku, authorization.id as string)
    }
  }

  async catch(err: any) {
    const {flags} = this.parse(ResetUsersCommand)

    if (err instanceof HTTPError) {
      if (err.statusCode === 404) {
        this.error(`Add-on ${color.addon(flags.addon)} is not a Borealis Isolated Postgres add-on`)
      } else if (err.statusCode === 422) {
        this.error(`Add-on ${color.addon(flags.addon)} is not finished provisioning`)
      } else {
        this.error('Add-on service is temporarily unavailable. Try again later.')
      }
    } else {
      throw err
    }
  }
}
