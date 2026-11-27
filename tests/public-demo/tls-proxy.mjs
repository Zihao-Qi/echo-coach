import fs from "node:fs";
import http from "node:http";
import https from "node:https";

// CI-only local endpoint, with the same browser scheme and cookie rules as Cloud Run.
const [target, key, cert] = process.argv.slice(2);
https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
  // Cloud Run's front end sets this. The page policy adds upgrade-insecure-requests only then.
  const headers = { ...req.headers, "x-forwarded-proto": "https" };
  const upstream = http.request({ hostname: target, port: 8080, path: req.url, method: req.method, headers }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}).listen(8443, "127.0.0.1");
