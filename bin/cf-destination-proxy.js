#!/usr/bin/env node

const {Command, Option} = require("commander");
const {version} = require("../package.json");
const bind = require("./commands/bind");
const run = require("./commands/run");

const program = new Command();
program.version(version);
program.addHelpText("beforeAll", `cf-destination-proxy v${version}\n`);

const envPath = new Option("-e, --env-path <path>", "path to the binding .env file(s)")
    .default(".", "current directory");
const port = new Option("-p, --port <number>", "local proxy port")
    .default(8887);

// command: bind
program.command('bind')
    .description("generates .env file that binds the local proxy to the deployed proxy")
    .argument("<route>", "[REQUIRED] the deployed proxy route, e.g. <...>cf-destination-proxy.cfapps.<region>.hana.ondemand.com")
    .addOption(envPath)
    .addOption(port)
    .action(bind);

// command: run
program.command('run')
    .description("run the local proxy")
    .addOption(envPath)
    .option("-l, --log", "log each request and its destination", false)
    .addOption(port)
    .action(run);

(async () => {
    try {
        await program.parseAsync();
    } catch (error) {
        console.error("[error]", error.message);
    }
})();
