// Zero-dependency health check used by the backend container's HEALTHCHECK
// instruction. Avoids installing curl/wget just to probe one endpoint.
const http = require("http");

const request = http.get({ host: "localhost", port: process.env.PORT || 4000, path: "/api/health", timeout: 3000 }, (res) => {
  process.exit(res.statusCode && res.statusCode < 500 ? 0 : 1);
});

request.on("error", () => process.exit(1));
request.on("timeout", () => {
  request.destroy();
  process.exit(1);
});
