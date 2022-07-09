import AddonInfoCommand from './info'

// This inherited class definition makes the borealis-pg:info command available as borealis-pg too.
// While oclif does support the concept of aliases (https://oclif.io/docs/aliases), in this
// particular case it seemed confusing given that it would have generated identical documentation
// for the two variants.
export default class RootIndexCommand extends AddonInfoCommand {}
