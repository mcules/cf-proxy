"use strict";

const {default: axios} = require("axios");
const {execSync} = require("child_process");
const {promises: {writeFile}, existsSync} = require("fs");
const {resolve} = require("path");
const {URLSearchParams} = require("url");
const {DESTINATION_INSTANCE_NAME, UAA_INSTANCE_NAME} = require("../constants");

/**
 * Constructs a Cloud Foundry service URL based on the given route and service.
 *
 * @param {string} route - The route URL from which the region will be parsed. Must follow the `.cfapps.<region>.hana.ondemand.com` pattern.
 * @param {string} service - The name of the Cloud Foundry service.
 * @return {string} The constructed Cloud Foundry service URL in the format `https://<service>.cf.<region>.hana.ondemand.com`.
 * @throws {Error} If the route format is invalid or the region cannot be parsed.
 */
function getCloudFoundryURL(route, service) {
    const match = route.match(/\.cfapps\.([\w-]+)\.hana\.ondemand\.com/);
    if (!match) {
        console.error("[ERROR] Route parsing failed for:", route);
        throw new Error(`Invalid route format: ${route}`);
    }
    const region = match[1];

    return `https://${service}.cf.${region}.hana.ondemand.com`;
}

/**
 * Authenticates the user against a Cloud Foundry (CF) instance and retrieves the necessary authentication headers.
 * Handles token validation, and if required, initiates Single Sign-On (SSO) login flow for authentication.
 *
 * @param {string} route - The base route or identifier used to construct the CF API URL.
 * @return {Promise<Object>} A promise that resolves to an object containing the `baseURL` and `headers` necessary for making authenticated requests. The `headers` include the `Authorization` token.
 */
async function authenticate(route) {
    console.log("[info]", "Checking CF authentication...");

    const apiURL = getCloudFoundryURL(route, "api");

    try {
        const access_token = execSync("cf oauth-token", {encoding: "utf-8"}).trim();

        if (!access_token.startsWith("bearer")) {
            throw new Error("No valid token found, need to re-authenticate.");
        }

        console.log("[info]", "CF authentication successful.");
        return {
            baseURL: apiURL,
            headers: {
                Authorization: access_token,
            },
        };
    } catch (error) {
        console.log("[warning]", "Not logged in. Initiating SSO login...");

        try {
            execSync("cf login --sso", {stdio: "inherit"});

            const access_token = execSync("cf oauth-token", {encoding: "utf-8"}).trim();
            if (!access_token.startsWith("bearer")) {
                throw new Error("Failed to obtain OAuth token after login.");
            }

            console.log("[info]", "Successfully logged in via SSO.");
            return {
                baseURL: apiURL,
                headers: {
                    Authorization: access_token,
                },
            };
        } catch (err) {
            throw new Error("CF SSO login failed.");
        }
    }
}

/**
 * Retrieves the GUID of an application associated with the provided URL by querying the Cloud Foundry API.
 *
 * @param {string} url - The URL of the application for which the GUID is to be fetched.
 * @param {object} authContext - The authentication context, which includes necessary credentials for accessing the Cloud Foundry API.
 * @return {Promise<string>} The GUID of the application linked to the provided URL.
 * @throws {Error} If the host cannot be extracted from the URL, or if the API request fails.
 */
async function getAppGuid(url, authContext) {
    console.log("[info]", `Fetching app details for ${url}...`);

    const host = (url.match(/^(https?:\/\/)?([^.]+)/) || [])[2];
    if (!host) throw new Error("Invalid host");

    if (!host) {
        console.error("[ERROR] Host extraction failed:", url);
        throw new Error("Invalid host");
    }

    const cloudFoundryAPI = axios.create(authContext);

    let response;

    try {
        response = await cloudFoundryAPI.get("/v3/routes", {
            params: {
                hosts: host,
                per_page: 1
            },
            authContext
        });
    } catch (error) {
        console.error("[ERROR] API Request failed:", error.message);

        if (error.response) {
            console.error("[ERROR] Response Status:", error.response.status);
            console.error("[ERROR] Response Data:", error.response.data);
        } else {
            console.error("[ERROR] No response received:", error.message);
        }

        throw new Error("Failed to fetch routes from Cloud Foundry API");
    }

    return response.data.resources[0].destinations[0].app.guid;
}

/**
 * Retrieves the credentials for a specified service associated with a given application GUID and authentication context.
 *
 * @param {string} service - The name of the service for which credentials are being fetched.
 * @param {string} appGuid - The GUID of the application associated with the service.
 * @param {Object} authContext - The authentication context required to access the cloud service API.
 * @return {Promise<Object>} A promise resolving to the credentials object containing service credentials.
 * @throws {Error} If no credentials bindings are found for the specified service.
 */
async function getServiceCredentials(service, appGuid, authContext) {
    console.log("[info]", `Fetching service credentials for ${service}...`);
    const cloudFoundryAPI = axios.create(authContext);
    const response = await cloudFoundryAPI.get("/v3/service_credential_bindings", {
        params: {app_guids: appGuid, service_instance_names: service, type: "app"},
    });

    if (!response.data.resources.length) {
        throw new Error(`Bindings for ${service} not found. Check the deployed proxy for errors`);
    }

    const detailsURL = response.data.resources[0].links.details.href;
    const credentialsResponse = await cloudFoundryAPI.get(detailsURL);
    return credentialsResponse.data.credentials;
}

/**
 * Fetches the destination details from the provided credentials.
 *
 * @param {Object} credentials An object containing the connection details.
 * @param {string} credentials.uri The URI endpoint for the destinations API.
 * @param {string} credentials.url The URL endpoint for the OAuth token request.
 * @param {string} credentials.clientid The client ID used for authentication.
 * @param {string} credentials.clientsecret The client secret used for authentication.
 * @return {Promise<Array<Object>>} A promise that resolves to an array of destination details,
 * each containing a `name` property and other additional properties.
 */
async function getDestinationDetails(credentials) {
    const {uri, url, clientid, clientsecret} = credentials;
    const uaaAPI = axios.create({
        baseURL: url,
        auth: {username: clientid, password: clientsecret},
    });
    const oauthBody = new URLSearchParams({grant_type: "client_credentials"});
    const tokenResponse = await uaaAPI.post("/oauth/token", oauthBody);
    const accessToken = tokenResponse.data.access_token;
    const destinationsAPI = axios.create({
        baseURL: uri,
        headers: {Authorization: `Bearer ${accessToken}`},
    });
    const response = await destinationsAPI.get("/destination-configuration/v1/subaccountDestinations");
    return response.data.map(({Name, ...additionalProperties}) => ({
        name: Name,
        additionalProperties, // Zusätzliche Eigenschaften
    }));
}

/**
 * Builds the environment configuration string including VCAP_SERVICES, destinations, and target options.
 *
 * @param {string} route - The base URL of the service route.
 * @param {number} proxyPort - The port number to be used for the proxy configuration.
 * @param {object} authContext - The authentication context required to access services and retrieve credentials.
 * @return {Promise<string>} A promise that resolves to the formatted environment configuration string.
 */
async function buildEnv(route, proxyPort, authContext) {
    const appGuid = await getAppGuid(route, authContext);
    const credentials = await getServiceCredentials(UAA_INSTANCE_NAME, appGuid, authContext);
    console.log("[info]", `Credentials for ${UAA_INSTANCE_NAME} obtained`);
    const destinationCredentials = await getServiceCredentials(
        DESTINATION_INSTANCE_NAME, appGuid, authContext
    );
    console.log("[info]", "Reading subaccount destinations...");
    const destinations = await getDestinationDetails(destinationCredentials);
    console.log("[info]", `Destinations available: ${destinations.map(d => d.name).join(", ")}`);
    const VCAP_SERVICES = {
        xsuaa: [{label: "xsuaa", plan: "broker", name: UAA_INSTANCE_NAME, tags: ["xsuaa"], credentials}],
    };
    const mappedDestinations = destinations.map(({name, additionalProperties}) => ({
        name,
        url: `http://${name}.dest`,
        proxyHost: "http://127.0.0.1",
        proxyPort,
        ...additionalProperties, // Hier werden die additionalProperties eingearbeitet
    }));
    const target = route.replace(/^(https?:\/\/)?([^/]+)\/?$/g, "https://$2");
    return `VCAP_SERVICES=${JSON.stringify(VCAP_SERVICES)}\n` +
        `destinations=${JSON.stringify(mappedDestinations)}\n` +
        `CFDP_TARGET=${target}`;
}

/**
 * Writes environment variables to a file. If a file with the same name exists, it creates a new file with an incremented name.
 *
 * @param {string} env - The environment variables to be written to the file.
 * @param {string} envPath - The directory path where the environment file should be created.
 * @return {Promise<void>} Resolves when the environment file is successfully written.
 */
async function writeEnv(env, envPath) {
    const baseFileName = ".env";
    let fileName = resolve(process.cwd(), envPath, baseFileName);
    let isFileWritten = false;
    let index = 0;
    while (!isFileWritten) {
        if (!existsSync(fileName)) {
            await writeFile(fileName, env);
            isFileWritten = true;
            console.log("[info]", `File ${fileName} created with binding parameters`);
        } else {
            fileName = resolve(process.cwd(), envPath, `.${++index}${baseFileName}`);
        }
    }
}

module.exports = async (route, options) => {
    console.log("module.exports = async-route: " + route);
    console.log(`Login to CF API endpoint: ${await getCloudFoundryURL(route, "api")}`);
    const authContext = await authenticate(route);
    const {port, envPath} = options;
    const env = await buildEnv(route, port, authContext);
    await writeEnv(env, envPath);
};