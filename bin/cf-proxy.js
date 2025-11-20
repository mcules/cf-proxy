#!/usr/bin/env node

const {Command, Option} = require("commander");
const {startTunnel, stopTunnel} = require("./commands/sshTunnel");
const bind = require("./commands/bind");
const run = require("./commands/run");
const {version} = require("../package.json");
const {DEFAULT_SSH_PORT, DEFAULT_PROXY_PORT} = require("./constants");

/**
 * The default file system path to the environment configuration file.
 * Used to denote the current directory unless explicitly overridden.
 *
 * DEFAULT_ENV_PATH is typically utilized to locate or identify
 * environmental configurations relevant for the application setup.
 */
const DEFAULT_ENV_PATH = ".";

/**
 * Represents the SSH port option for configuring the local port of the SSH tunnel.
 *
 * This option allows the user to specify a custom port number for the SSH tunnel.
 * By default, it assigns the specified `DEFAULT_SSH_PORT` as the port value (default: 1348).
 *
 * The option can be invoked using the flags `-p` or `--port` followed by the desired port number.
 */
const sshPortOption = new Option("-p, --port <number>", "local port for the SSH tunnel")
    .default(DEFAULT_SSH_PORT, "default port (1348)");

/**
 * Represents a command-line option for specifying the path to the binding .env file(s).
 *
 * This option accepts a string representing the file path to the environment file(s),
 * allowing users to define a custom location. If no path is specified, it defaults
 * to the current directory.
 *
 * - Short flag: `-e`
 * - Long flag: `--env-path <path>`
 *
 * Default value: The current directory.
 *
 * Description: Path to the binding .env file(s).
 */
const envPathOption = new Option("-e, --env-path <path>", "path to the binding .env file(s)")
    .default(DEFAULT_ENV_PATH, "current directory");

/**
 * Represents the command line option for specifying the local proxy port.
 *
 * The `proxyPortOption` enables the user to define the port number
 * used by the local proxy service. If no custom port is provided,
 * a default port of 8887 is used.
 *
 * Option:
 * - "-p, --port <number>" - Allows the user to specify a port number.
 *
 * Default:
 * - DEFAULT_PROXY_PORT (8887) - Used when no custom port is specified.
 */
const proxyPortOption = new Option("-p, --port <number>", "local proxy port")
    .default(DEFAULT_PROXY_PORT, "default port (8887)");

/**
 * Represents an instance of the Command class used for handling and parsing command-line operations.
 * The `program` variable is initialized to define and manage commands, options, and arguments within a command-line interface.
 */
const program = new Command();
program.version(version);
program.addHelpText("beforeAll", `cf-proxy v${version}\n`);

/**
 * Configures a command with the specified parameters including its description, options, arguments, and action.
 *
 * @param {string} command - The name of the command to be configured.
 * @param {string} description - A brief description of the command.
 * @param {Array} options - An array of options to be added to the command.
 * @param {Function} action - The action callback function to be executed when the command is run.
 * @param {Array|null} [argument=null] - An optional array of arguments to be added to the command.
 * @return {void} - Does not return a value.
 */
function configureCommand(command, description, options, action, argument = null) {
    const cmd = program.command(command).description(description);
    if (argument) {
        for (const arg of argument) {
            cmd.argument(arg);
        }
    }
    options.forEach(option => cmd.addOption(option));
    cmd.action(action);
}

configureCommand(
    "sshTunnel:start",
    "Start the SSH tunnel to the specified Cloud Foundry app",
    [],
    startTunnel,
    ["<cf_app>", "<remote_host>", "[remote port]", "[port]"]
);

configureCommand(
    "sshTunnel:stop",
    "Stop the SSH tunnel running on the specified local port",
    [sshPortOption],
    stopTunnel
);

configureCommand(
    "bind",
    "Generates .env file that binds the local proxy to the deployed proxy",
    [envPathOption, proxyPortOption],
    bind,
    ["<route>"]
);

configureCommand(
    "run",
    "Run the local proxy",
    [envPathOption, proxyPortOption, new Option("-l, --log", "log each request and its destination").default(false)],
    run
);

(async () => {
    try {
        await program.parseAsync();
    } catch (error) {
        console.error("[error] An unexpected error occurred:", error.message);
    }
})();