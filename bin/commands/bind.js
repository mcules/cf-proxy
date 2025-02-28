"use strict";

const {default: axios} = require("axios");
const {execSync} = require("child_process");
const {promises: {writeFile}, existsSync} = require("fs");
const {resolve} = require("path");
const {URLSearchParams} = require("url");
const {DESTINATION_INSTANCE_NAME, UAA_INSTANCE_NAME} = require("../constants");

const getCloudFoundryURL = (route, service) => {
  const match = route.match(/\.cfapps\.([\w-]+)\.hana\.ondemand\.com/);
  if (!match) {
    console.error("[ERROR] Route parsing failed for:", route);
    throw new Error(`Invalid route format: ${route}`);
  }
  const region = match[1];

  return `https://${service}.cf.${region}.hana.ondemand.com`;
};

const authenticate = async (route) => {
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
};

const getAppGuid = async (url, authContext) => {
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
};

const getServiceCredentials = async (service, appGuid, authContext) => {
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
};

const getDestinationNames = async (credentials) => {
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
    params: {$select: "Name"},
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  const response = await destinationsAPI.get("/destination-configuration/v1/subaccountDestinations");
  return response.data.map(({Name}) => Name);
};

const buildEnv = async (route, proxyPort, authContext) => {
  const appGuid = await getAppGuid(route, authContext);
  const credentials = await getServiceCredentials(UAA_INSTANCE_NAME, appGuid, authContext);
  console.log("[info]", `Credentials for ${UAA_INSTANCE_NAME} obtained`);

  const destinationCredentials = await getServiceCredentials(
    DESTINATION_INSTANCE_NAME, appGuid, authContext
  );
  console.log("[info]", "Reading subaccount destinations...");
  const destinationNames = await getDestinationNames(destinationCredentials);
  console.log("[info]", `Destinations available: ${destinationNames.join(", ")}`);

  const VCAP_SERVICES = {
    xsuaa: [{label: "xsuaa", plan: "broker", name: UAA_INSTANCE_NAME, tags: ["xsuaa"], credentials}],
  };

  const destinations = destinationNames.map(name => ({
    name,
    url: `http://${name}.dest`,
    proxyHost: "http://127.0.0.1",
    proxyPort,
  }));

  const target = route.replace(/^(https?:\/\/)?([^/]+)\/?$/g, "https://$2");

  return `VCAP_SERVICES=${JSON.stringify(VCAP_SERVICES)}\n` +
    `destinations=${JSON.stringify(destinations)}\n` +
    `CFDP_TARGET=${target}`;
};

const writeEnv = async (env, envPath) => {
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
};

module.exports = async (route, options) => {
  console.log(`Login to CF API endpoint: ${getCloudFoundryURL(route, "api")}`);

  const authContext = await authenticate(route);
  const {port, envPath} = options;
  const env = await buildEnv(route, port, authContext);
  await writeEnv(env, envPath);
};