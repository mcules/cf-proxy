#!/usr/bin/env node

const {Command, Option} = require("commander");
const {startTunnel, stopTunnel} = require("./commands/sshTunnel");
const bind = require("./commands/bind");
const run = require("./commands/run");
const {version} = require("../package.json");
const {DEFAULT_SSH_PORT, DEFAULT_PROXY_PORT} = require("./constants");

const DEFAULT_ENV_PATH = ".";

const sshPortOption = new Option("-p, --port <number>", "local port for the SSH tunnel")
    .default(DEFAULT_SSH_PORT, "default port (1348)");

const envPathOption = new Option("-e, --env-path <path>", "path to the binding .env file(s)")
    .default(DEFAULT_ENV_PATH, "current directory");

const proxyPortOption = new Option("-p, --port <number>", "local proxy port")
    .default(DEFAULT_PROXY_PORT, "default port (8887)");

const program = new Command();
program.version(version);
program.addHelpText("beforeAll", `cf-proxy v${version}\n`);

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

// Start SSH tunnel
configureCommand(
    "sshTunnel:start",
    "Start the SSH tunnel to the specified Cloud Foundry app",
    [],
    startTunnel,
    ["<cf_app>", "<remote_host>", "[port]"]
);

// Stop SSH tunnel
configureCommand(
    "sshTunnel:stop",
    "Stop the SSH tunnel running on the specified local port",
    [sshPortOption],
    stopTunnel
);

// Destination Proxy Commands
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