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
* [`heroku borealis-pg:psql`](#heroku-borealis-pgpsql)
* [`heroku borealis-pg:run`](#heroku-borealis-pgrun)
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

_See code: [src/commands/borealis-pg/extensions/index.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/extensions/index.ts)_

## `heroku borealis-pg:extensions:install PG_EXTENSION`

installs a Postgres extension on a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions:install PG_EXTENSION

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

OPTIONS
  -a, --app=app            app to which the add-on is attached
  -o, --addon=addon        (required) name or ID of an add-on or one of its attachments
  -r, --recursive          automatically install Postgres extension dependencies recursively
  -s, --suppress-conflict  suppress nonzero exit code when an extension is already installed

DESCRIPTION
  Each extension is typically installed with its own dedicated database schema,
  which may be used to store types, functions, tables or other objects that are
  part of the extension.

  If an extension has any unsatisfied dependencies, its dependencies will be
  installed automatically only if the --recursive option is provided.

  Details of all supported extensions can be found here:
  https://www.borealis-data.com/pg-extensions-support.html
```

_See code: [src/commands/borealis-pg/extensions/install.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/extensions/install.ts)_

## `heroku borealis-pg:extensions:remove PG_EXTENSION`

removes a Postgres extension from a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:extensions:remove PG_EXTENSION

ARGUMENTS
  PG_EXTENSION  name of a Postgres extension

OPTIONS
  -a, --app=app           app to which the add-on is attached
  -c, --confirm=confirm   bypass the prompt for confirmation by specifying the name of the extension
  -o, --addon=addon       (required) name or ID of an add-on or one of its attachments
  -s, --suppress-missing  suppress nonzero exit code when an extension is not installed
```

_See code: [src/commands/borealis-pg/extensions/remove.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/extensions/remove.ts)_

## `heroku borealis-pg:psql`

runs psql with a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:psql

OPTIONS
  -a, --app=app                  app to which the add-on is attached
  -b, --binary-path=binary-path  custom path to a psql binary
  -o, --addon=addon              (required) name or ID of an add-on or one of its attachments
  -p, --port=port                [default: 5432] local port number for the secure tunnel to the add-on Postgres server
  -w, --write-access             allow write access to the add-on Postgres database

DESCRIPTION
  This operation establishes a temporary secure tunnel to an add-on database to
  provide an interactive psql session. It requires that the psql command is
  installed on the local machine; generally, psql is installed along with
  PostgreSQL (https://www.postgresql.org/download/).

  By default, read-only user credentials are used to connect to the add-on
  database; to enable read and write access, supply the --write-access option.

  To override the path to the psql binary, supply the --binary-path option.

  See also the borealis-pg:run command to execute a noninteractive script or the
  borealis-pg:tunnel command to start a secure tunnel session that can be used
  in combination with any PostgreSQL client (e.g. a graphical user interface like
  pgAdmin).

EXAMPLES
  $ heroku borealis-pg:psql --addon borealis-pg-hex-12345
  $ heroku borealis-pg:psql --app sushi --addon DATABASE --binary-path /path/to/psql
  $ heroku borealis-pg:psql --app sushi --addon DATABASE_URL --write-access
```

_See code: [src/commands/borealis-pg/psql.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/psql.ts)_

## `heroku borealis-pg:run`

runs a command with a secure tunnel to a Borealis Isolated Postgres add-on

```
USAGE
  $ heroku borealis-pg:run

OPTIONS
  -a, --app=app                       app to which the add-on is attached
  -d, --db-cmd=db-cmd                 database command to execute over the secure tunnel
  -e, --shell-cmd=shell-cmd           shell command to execute when the secure tunnel is established
  -f, --format=(table|csv|json|yaml)  [default: table] output format for database command results
  -i, --db-cmd-file=db-cmd-file       UTF-8 file containing database command(s) to execute over the secure tunnel
  -o, --addon=addon                   (required) name or ID of an add-on or one of its attachments

  -p, --port=port                     [default: 5432] local port number for the secure tunnel to the add-on Postgres
                                      server

  -u, --personal-user                 run as a personal user rather than a user belonging to the Heroku application

  -w, --write-access                  allow write access to the add-on Postgres database

DESCRIPTION
  An add-on Postgres database is, by design, inaccessible from outside of its
  virtual private cloud. As such, this operation establishes an ephemeral secure
  tunnel to an add-on database to execute a provided noninteractive command, then
  immediately closes the tunnel.

  A command can take the form of a database command or a shell command. In either
  case, it is executed using the Heroku application's dedicated database user by
  default, but it can be made to execute as a database user that is specifically
  tied to the current Heroku user account via the --personal-user option instead.
  Note that any tables, indexes, views or other objects that are created when
  connected as a personal user will be owned by that user rather than the
  application database user unless ownership is explicitly reassigned.

  By default, the user credentials that are provided allow read-only access to
  the add-on database; to enable read and write access, supply the --write-access
  option.

  Database commands are raw statements (e.g. SQL, PL/pgSQL) that are sent over
  the secure tunnel to the add-on Postgres database to be executed verbatim, with
  the results then written to the console on stdout.

  Shell commands are useful for executing an application's database migration
  scripts or other unattended database scripts. They are executed in a shell on
  the local machine with the following environment variables automatically set to
  allow scripts and applications that are launched by the command to connect over
  the secure tunnel to the remote add-on Postgres database:
      - PGHOST
      - PGPORT
      - PGDATABASE
      - PGUSER
      - PGPASSWORD
      - DATABASE_URL

  See also the borealis-pg:psql command to launch an interactive psql session or
  the borealis-pg:tunnel command to start a secure tunnel session that can be
  used in combination with any PostgreSQL client (e.g. a graphical user interface
  like pgAdmin).

EXAMPLES
  $ heroku borealis-pg:run --addon borealis-pg-hex-12345 --shell-cmd './manage.py migrate' --write-access
  $ heroku borealis-pg:run --app sushi --addon DATABASE --db-cmd 'SELECT * FROM hello_greeting' --format csv
  $ heroku borealis-pg:run --app sushi --addon DATABASE_URL --db-cmd-file ~/scripts/example.sql --personal-user
```

_See code: [src/commands/borealis-pg/run.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/run.ts)_

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
  This operation allows for a secure, temporary session connection to an add-on
  Postgres database that is, by design, otherwise inaccessible from outside of
  its virtual private cloud. Once a tunnel is established, use a tool such as
  psql or pgAdmin and the provided user credentials to interact with the add-on
  database. By default, the user credentials that are provided allow read-only
  access to the add-on database; to enable read and write access, supply the
  --write-access option.

  See also the borealis-pg:run command to execute a noninteractive script or the
  borealis-pg:psql command to launch an interactive psql session directly.

EXAMPLES
  $ heroku borealis-pg:tunnel --addon borealis-pg-hex-12345 --write-access
  $ heroku borealis-pg:tunnel --app sushi --addon DATABASE --port 54321
  $ heroku borealis-pg:tunnel --app sushi --addon DATABASE_URL
```

_See code: [src/commands/borealis-pg/tunnel.ts](https://github.com/OldSneerJaw/borealis-pg-cli/blob/v0.9.0/src/commands/borealis-pg/tunnel.ts)_
<!-- commandsstop -->
