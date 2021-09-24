borealis-pg-cli
===============

This [plugin](https://devcenter.heroku.com/articles/using-cli-plugins) for the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) enables various advanced interactions with a [Borealis Isolated Postgres add-on](https://elements.heroku.com/addons/borealis-pg).

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/borealis-pg-cli.svg)](https://npmjs.org/package/borealis-pg-cli)
[![License](https://img.shields.io/npm/l/borealis-pg-cli.svg)](https://github.com/OldSneerJaw/borealis-pg-cli/blob/master/package.json)

<!-- toc -->
* [Installation](#installation)
* [Commands](#commands)
<!-- tocstop -->

# Installation

First, ensure the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) is installed, then execute the following from a terminal:

```sh-session
$ heroku plugins:install borealis-pg-cli
```

# Commands
<!-- commands -->
* [`heroku borealis-pg:extensions`](#heroku-borealis-pgextensions)
* [`heroku borealis-pg:extensions:install PG_EXTENSION`](#heroku-borealis-pgextensionsinstall-pg_extension)
* [`heroku borealis-pg:extensions:remove PG_EXTENSION`](#heroku-borealis-pgextensionsremove-pg_extension)
* [`heroku borealis-pg:tunnel`](#heroku-borealis-pgtunnel)

## `heroku borealis-pg:extensions`

lists installed Postgres extensions for a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions

OPTIONS
  -a, --app=app      app to which the add-on is attached
  -o, --addon=addon  (required) name or ID of an add-on or one of its attachments
```

_See code: [src/commands/borealis-pg/extensions/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.1.0/src/commands/borealis-pg/extensions/index.ts)_

## `heroku borealis-pg:extensions:install PG_EXTENSION`

installs a Postgres extension on a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions:install PG_EXTENSION

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

OPTIONS
  -a, --app=app      app to which the add-on is attached
  -o, --addon=addon  (required) name or ID of an add-on or one of its attachments
  -r, --recursive    automatically install Postgres extension dependencies recursively

DESCRIPTION
  If the extension has any unsatisfied dependencies, those Postgres extensions
  will also be installed automatically. Each extension is typically installed
  with its own dedicated database schema, which may be used to store types,
  functions, tables or other objects that are part of the extension.

  Details of supported extensions can be found here:
  https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Extensions.html
```

_See code: [src/commands/borealis-pg/extensions/install.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.1.0/src/commands/borealis-pg/extensions/install.ts)_

## `heroku borealis-pg:extensions:remove PG_EXTENSION`

removes a Postgres extension from a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions:remove PG_EXTENSION

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

OPTIONS
  -a, --app=app          app to which the add-on is attached
  -c, --confirm=confirm  bypass the prompt for confirmation by specifying the name of the extension
  -o, --addon=addon      (required) name or ID of an add-on or one of its attachments
```

_See code: [src/commands/borealis-pg/extensions/remove.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.1.0/src/commands/borealis-pg/extensions/remove.ts)_

## `heroku borealis-pg:tunnel`

establishes a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:tunnel

OPTIONS
  -a, --app=app       app to which the add-on is attached
  -o, --addon=addon   (required) name or ID of an add-on or one of its attachments
  -p, --port=port     [default: 5432] local port number for the secure tunnel to the add-on Postgres server
  -w, --write-access  allow write access to the add-on Postgres database

DESCRIPTION
  This command allows for local, temporary connections to an add-on Postgres
  database that is, by design, otherwise inaccessible from outside of its
  virtual private cloud. Once a tunnel is established, use a tool such as psql or
  pgAdmin to interact with the add-on database.
```

_See code: [src/commands/borealis-pg/tunnel.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.1.0/src/commands/borealis-pg/tunnel.ts)_
<!-- commandsstop -->
