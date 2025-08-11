# cf-destination-proxy Setup Guide

This guide provides instructions for setting up and configuring a local proxy to connect with a remote `cf-destination-proxy` service. By following the steps outlined below, you will:
- Set environment variables for proxy usage.
- Install the project dependencies.
- Configure scripts and bindings for XSUAA and proxy startup.

Ensure to have Node.js and npm installed before proceeding.
## Deploy the remote application to SAP BTP
The remote application is already available in the `/remote` folder. Follow these steps to deploy it to SAP Business Technology Platform (BTP):

### Prerequisites
1. **SAP BTP Access**: Ensure you have access to a subaccount and space in SAP BTP.
2. **Cloud Foundry CLI**: Install the [Cloud Foundry CLI](https://docs.cloudfoundry.org/cf-cli/) and authenticate to your BTP environment.
3. **Pre-configured Services**: Ensure the required services (e.g., XSUAA, destination service) are already created in your BTP subaccount.
4. **Node.js Environment**: The application uses Node.js—make sure Node.js is supported in the configured buildpacks.

### Steps to Deploy the proxy endpoint
#### 1. **Navigate to the `/remote` Folder**
Open a terminal and navigate to the `remote` application folder:
``` bash
cd remote
```

#### 2. **Login to SAP BTP Cloud Foundry**
Log in to the Cloud Foundry environment using the following command:
``` bash
cf login -a <API_ENDPOINT> -u <USERNAME> -o <ORG> -s <SPACE>
```
Replace:
- `<API_ENDPOINT>`: Your BTP API endpoint (e.g., `https://api.cf.<region>.hana.ondemand.com`).
- `<USERNAME>`: Your BTP username.
- `<ORG>`: Your organization name in BTP.
- `<SPACE>`: Your space name in BTP.

If additional configuration is needed, modify the file accordingly.

#### 3. **Deploy the Application**
Deploy the remote app to SAP BTP using the following command:
``` bash
cf push
```

The `cf push` command will:
- Upload the application from the `/remote` folder.
- Bind any configured services from the `manifest.yml`.
- Start the application in your specified space.

#### 4. **Verify Deployment**
Once the deployment completes:
- Go to the SAP BTP Cockpit.
- Navigate to your subaccount → space → applications.
- Verify that the application (e.g., `remote-app`) is running.

#### 5. **Access the Application**
Copy the application URL from the BTP cockpit or the CLI output. For example:
``` 
https://remote-app.<region>.cfapps.<landscape>.hana.ondemand.com
```
Use this URL to access the remote application.

### Optional Steps
- **Service Bindings**: If you need to bind new services to the existing application, use the `cf bind-service` command:
``` bash
cf bind-service remote-app <SERVICE-NAME>
cf restage remote-app
```

- **Log Monitoring**: Check logs if the deployment encounters issues:
``` bash
cf logs remote-app --recent
```

### Summary
Navigate to the `/remote` folder and execute `cf push`. The application should be deployed and accessible in your defined SAP BTP space.

## Setting Up local Proxy

### Installation
First, install the necessary dependencies:

```bash
npm install -g .
```

### Create `.env` File
Create a `.env` file in the root directory, which binds the proxy to a remote service:

```bash
cf-proxy bind https://cf-proxy.cfapps.eu10.hana.ondemand.com
```
**Replace** `https://cf-proxy.cfapps.eu10.hana.ondemand.com` with the URL of your SAP BTP destination proxy's endpoint.

### Adding Start Script for Proxy
To start the proxy locally, add the following to your `app/package.json` file’s `scripts` section:

```
"proxy": "cf-proxy run"
```

### XSUAA Binding Configuration
If you use XSUAA services, include the binding script in the root `package.json`:

```
"bind:xsuaa": "npx cds-ts bind uaa --to XSUAA-RESOURCE-NAME --kind xsuaa --for hybrid"
```

**Replace** `XSUAA-RESOURCE-NAME` with the name of your XSUAA service instance. This binds your application securely to the respective resource.

### Add proxy environment variables

#### Windows
```bash
set http_proxy=http://127.0.0.1:8887
set https_proxy=http://127.0.0.1:8887
set all_proxy=http://127.0.0.1:8887
```

#### Linux
```bash
export http_proxy=http://127.0.0.1:8887
export https_proxy=http://127.0.0.1:8887
export all_proxy=http://127.0.0.1:8887
```

## Next Steps
Once all steps are completed, you can:
1. Run the proxy using `npm run proxy`.
2. Test your application to ensure proxy settings are applied correctly.
3. Refer to the official documentation for additional features or advanced configurations.

## Starting and Stopping an SSH Tunnel
An SSH tunnel establishes a secure connection between your local machine and a remote host—useful for accessing resources through a Cloud Foundry application. The `cf-proxy` utility provides commands to easily start and stop an SSH tunnel.

### **Start the SSH Tunnel**
To start the SSH tunnel, use the following command:

```shell script
cf-proxy sshTunnel:start <cf_app> <remote_host> [port]
```
- `<cf_app>`: The name of the Cloud Foundry application.
- `<remote_host>`: The hostname or IP address of the remote server you want to connect to.
- `[port]` (optional): The local port for the SSH tunnel. Defaults to `1348` if not specified.

### **Stop the SSH Tunnel**
To stop the SSH tunnel running on a specific local port, use the following command:

```shell script
cf-proxy sshTunnel:stop --port <port>
```
- `<port>`: The local port on which the SSH tunnel is running.