#!/usr/bin/env node

const {Command} = require("commander");
const {startTunnel, stopTunnel} = require("./commands/sshTunnel");
const {version} = require("../package.json");

const program = new Command();
program.version(version);
program.addHelpText("beforeAll", `cf-ssh-proxy v${version}\n`);

// command: start
program.command('start')
    .description("Start the SSH tunnel to the specified Cloud Foundry app")
    .argument("[cf_app]", "Cloud Foundry application name")
    .argument("[remote_host]", "Remote database hostname")
    .argument("[port]", "Local port for the tunnel")
    .action(startTunnel);

// command: stop
program.command('stop')
    .description("Stop the SSH tunnel running on the specified local port")
    .argument("[port]", "Local port to stop", "1348")
    .action(stopTunnel);

(async () => {
    try {
        await program.parseAsync();
    } catch (error) {
        console.error("[error]", error.message);
    }
})();
