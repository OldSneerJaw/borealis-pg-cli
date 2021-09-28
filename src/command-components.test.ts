import color from '@heroku-cli/color'
import {AddOnAttachment} from '@heroku-cli/schema'
import {expect} from 'fancy-test'
import {anyString, instance, mock, verify} from 'ts-mockito'
import {consoleColours, processAddonAttachmentInfo} from './command-components'

describe('processAddonAttachmentInfo', () => {
  const fakeAddonAttachmentName = 'MY_NEAT_DB'
  const fakeAppName = 'my-neat-app'
  const fakeAddonName = 'my-neat-addon'

  let errorHandlerMockType: {func: ((message: string) => never)}
  let errorHandlerMockInstance: typeof errorHandlerMockType

  beforeEach(() => {
    errorHandlerMockType = mock()
    errorHandlerMockInstance = instance(errorHandlerMockType)
  })

  it('returns the first entry when there are multiple', () => {
    const fakeAttachments: AddOnAttachment[] = [
      {
        addon: {app: {}, id: '#1', name: fakeAddonName},
        app: {name: fakeAppName},
        name: fakeAddonAttachmentName,
      },
      {
        addon: {app: {}, id: '#2', name: 'another-addon'},
        app: {name: 'another-app'},
        name: 'another-attachment',
      },
    ]

    const result = processAddonAttachmentInfo(
      fakeAttachments,
      {addonOrAttachment: fakeAddonName},
      errorHandlerMockInstance.func)

    expect(result).to.deep.equal({
      addonName: fakeAddonName,
      appName: fakeAppName,
      attachmentName: fakeAddonAttachmentName,
    })

    verify(errorHandlerMockType.func(anyString())).never()
  })

  it('returns the first entry when there is only one', () => {
    const fakeAttachments: AddOnAttachment[] = [
      {
        addon: {app: {}, id: '#1', name: fakeAddonName},
        app: {name: fakeAppName},
        name: fakeAddonAttachmentName,
      },
    ]

    const result = processAddonAttachmentInfo(
      fakeAttachments,
      {addonOrAttachment: fakeAddonAttachmentName, app: fakeAppName},
      errorHandlerMockInstance.func)

    expect(result).to.deep.equal({
      addonName: fakeAddonName,
      appName: fakeAppName,
      attachmentName: fakeAddonAttachmentName,
    })

    verify(errorHandlerMockType.func(anyString())).never()
  })

  it('indicates when the attachment does not belong to the app', () => {
    const expectedMessage =
      `App ${color.app(fakeAppName)} has no ${color.addon(fakeAddonAttachmentName)} add-on ` +
      'attachment'

    const result = processAddonAttachmentInfo(
      null,
      {addonOrAttachment: fakeAddonAttachmentName, app: fakeAppName},
      errorHandlerMockInstance.func)

    expect(result).not.to.exist

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates when the add-on name does not correspond to an add-on', () => {
    const expectedMessage =
      `Add-on ${color.addon(fakeAddonName)} was not found. Consider trying again with the ` +
      `${consoleColours.cliFlagName('--app')} flag.`

    const result = processAddonAttachmentInfo(
      null,
      {addonOrAttachment: fakeAddonName},
      errorHandlerMockInstance.func)

    expect(result).not.to.exist

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates an error when the attachment does not have an addon field', () => {
    const fakeAttachments: AddOnAttachment[] = [{id: fakeAddonAttachmentName}]
    const expectedMessage = 'Add-on service is temporarily unavailable. Try again later.'

    const result = processAddonAttachmentInfo(
      fakeAttachments,
      {addonOrAttachment: fakeAddonAttachmentName, app: fakeAppName},
      errorHandlerMockInstance.func)

    expect(result).not.to.exist

    verify(errorHandlerMockType.func(expectedMessage)).once()
  })

  it('indicates an error when the attachment list is empty', () => {
    const fakeAttachments: AddOnAttachment[] = []

    const result = processAddonAttachmentInfo(
      fakeAttachments,
      {addonOrAttachment: fakeAddonName},
      errorHandlerMockInstance.func)

    expect(result).not.to.exist

    verify(errorHandlerMockType.func(anyString())).once()
  })
})
