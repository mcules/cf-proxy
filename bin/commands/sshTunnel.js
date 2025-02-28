const { execSync, spawn } = require("child_process");

// Function to check if a process is using the given port
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

// Function to terminate a process by PID
function killProcessByPid(pid) {
    try {
        execSync(`taskkill /PID ${pid} /F`);
    } catch (error) {
        console.error(`❌ Failed to terminate process ${pid}.`);
    }
}

// Sleep function (Replaces timeout)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start SSH Tunnel
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