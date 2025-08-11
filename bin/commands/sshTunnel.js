const {execSync, spawn} = require("child_process");

/**
 * Retrieves the process ID (PID) of the process running on the specified port.
 *
 * @param {number} port - The port number to check for an active process.
 * @return {string|null} The PID of the process running on the specified port, or null if no process is found or an error occurs.
 */
function getProcessOnPort(port) {
    try {
        const result = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = result.split("\n").filter(line => line.trim() !== "");

        if (lines.length === 0) return null; // No process found

        const parts = lines[0].trim().split(/\s+/);
        return parts[parts.length - 1]; // PID is the last column
    } catch (error) {
        return null;
    }
}

/**
 * Terminates a process with the specified process ID (PID).
 * Uses the 'taskkill' command to forcefully kill the process.
 *
 * @param {number} pid The process ID of the process to terminate.
 * @return {void} Does not return a value.
 */
function killProcessByPid(pid) {
    try {
        execSync(`taskkill /PID ${pid} /F`);
    } catch (error) {
        console.error(`❌ Failed to terminate process ${pid}.`);
    }
}

/**
 * Pauses the execution of code for the specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to sleep before resolving the Promise.
 * @return {Promise<void>} A Promise that resolves after the specified delay.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Starts an SSH tunnel to the specified remote host and port via the given Cloud Foundry application.
 * If the specified port is already in use, the existing process using the port will be stopped.
 *
 * @param {string} cfApp - The name of the Cloud Foundry application to connect to using `cf ssh`.
 * @param {string} remoteHost - The remote host to which the tunnel should redirect traffic.
 * @param {number} port - The local port to bind the tunnel to.
 *
 * @return {Promise<void>} Resolves when the tunnel is successfully started or attempts to start have been exhausted.
 */
async function startTunnel(cfApp, remoteHost, port) {
    let pid = getProcessOnPort(port);
    if (pid) {
        console.log(`⚠️ Port ${port} is already in use by process PID ${pid}.`);
        stopTunnel(port);
    }

    console.log(`🔄 Establishing SSH tunnel...`);

    try {
        const sshTunnel = spawn("cf", ["ssh", "-L", `localhost:${port}:${remoteHost}:${port}`, cfApp, "-N"], {
            detached: true,
            stdio: "ignore"
        });

        sshTunnel.unref();

        // Wait for process to appear
        let attempts = 5;
        let started = false;

        while (attempts > 0) {
            await sleep(1000);
            pid = getProcessOnPort(port);
            if (pid) {
                started = true;
                break;
            }
            console.log(`⏳ Waiting for SSH tunnel to start... (${5 - attempts + 1}/5)`);
            attempts--;
        }

        if (started) {
            console.log(`✅  SSH tunnel started in the background (PID: ${pid}).`);
        } else {
            console.error(`❌ Failed to start SSH tunnel within the timeout.`);
        }
    } catch (error) {
        console.error(`❌ Failed to start SSH tunnel. Is 'cf ssh' installed and configured?`);
        process.exit(1);
    }
}

/**
 * Stops the SSH tunnel running on the specified port.
 *
 * @param {number} port - The port number where the SSH tunnel is running.
 * @return {void} No return value.
 */
function stopTunnel(port) {
    const pid = getProcessOnPort(port);
    if (pid) {
        killProcessByPid(pid);
        console.log(`✅  SSH tunnel on port ${port} has been stopped.`);
    } else {
        console.log(`⚡ No SSH tunnel found on port ${port}.`);
    }
}

module.exports = {startTunnel, stopTunnel};