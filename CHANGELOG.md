# Change Log
This project adheres to [Semantic Versioning](http://semver.org/). All notable changes will be documented in this file.

## [0.6.1](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.6.0...v0.6.1)
- Improve error message when deleting a PostgreSQL extension with dependent objects

## [0.6.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.5.0...v0.6.0)
- Handle cases where DB write access is disabled due to persistent storage limit violations

## [0.5.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.4.0...v0.5.0)
- Require "identity" scope for Heroku authorizations

## [0.4.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.3.1...v0.4.0)
- Clarified in the `borealis-pg:tunnel` command's output that it does not accept keyboard input
- Handle port conflicts for secure tunnels on Windows

## [0.3.1](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.3.0...v0.3.1)
- Updated dependencies to address a [vulnerability](https://nvd.nist.gov/vuln/detail/CVE-2021-3807) in the ansi-regex package

## [0.3.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.2.2...v0.3.0)
- `borealis-pg:run` and `borealis-pg:tunnel` now indicate in their output whether the user is read-only or read/write
- `borealis-pg:run` and `borealis-pg:tunnel` now use pg-tunnel.borealis-data.com for client connections (DNS entry points to 127.0.0.1)

## [0.2.2](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.2.1...v0.2.2)
- Changed URL to Postgres extension support page

## [0.2.1](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.2.0...v0.2.1)
- Re-release of v0.2.0 to fix a build problem

## [0.2.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/v0.1.0...v0.2.0)
- Added the `borealis-pg:run` command to execute a noninteractive SQL or shell command for an add-on database
- The `borealis-pg:extensions:install` command now includes the option to suppress the error when a Postgres extension is already installed
- The `borealis-pg:extensions:remove` command now includes the option to suppress the error when a Postgres extension is not installed

## [0.1.0](https://github.com/OldSneerJaw/borealis-pg-cli/compare/477321d...v0.1.0)
First public pre-release version
