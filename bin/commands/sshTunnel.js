const {execSync, spawn} = require("child_process");

/**
 * Retrieves the process ID (PID) of the process that is using the specified port.
 *
 * @param {number} port - The port number to check for an associated process.
 * @return {string|null} Returns the PID of the process using the specified port, or null if no process is found or an error occurs.
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
 * Terminates a process by its process ID (PID).
 *
 * @param {number} pid - The process ID of the process to be terminated.
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
 * Suspends the execution of the program for a specified duration.
 *
 * @param {number} ms - The number of milliseconds to pause execution.
 * @return {Promise<void>} A promise that resolves after the specified duration.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Establishes an SSH tunnel to a remote host via a Cloud Foundry application.
 * If the specified port is already in use, the process occupying the port will be terminated before establishing the new tunnel.
 *
 * @param {string} cfApp - The name of the Cloud Foundry application to establish the tunnel through.
 * @param {string} remoteHost - The remote host to connect to via the SSH tunnel.
 * @param {number} port - The local port to use for the SSH tunnel.
 * @return {Promise<void>} Resolves when the process of starting the SSH tunnel has completed. Logs status messages during the operation.
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
 * Stops an SSH tunnel running on the specified port, if it exists.
 *
 * @param {number} port - The port number of the SSH tunnel to stop.
 * @return {void} Does not return a value.
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