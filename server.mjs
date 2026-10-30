import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const COOKIE_NAME = "mathsite_session";
const SESSION_SECONDS = 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;

const assetDirectories = [
  ["/scram", require("@mercuryworkshop/scramjet/path").scramjetPath],
  ["/controller", dirname(require.resolve("@mercuryworkshop/scramjet-controller"))],
  ["/libcurl", dirname(require.resolve("@mercuryworkshop/libcurl-transport"))],
];

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_private_ips: false,
  allow_loopback_ips: false,
  allow_direct_ip: false,
  allow_udp_streams: false,
  allow_tcp_streams: true,
  port_whitelist: [80, 443],
  // Wisp 0.4.1's per-host counter iterates a plain object and throws.
  // Its total-stream counter uses Object.keys and works correctly.
  stream_limit_per_host: -1,
  stream_limit_total: 128,
  parse_real_ip: false,
});

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function loginPage(message = "") {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Mathsite Scramjet</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#eef3fb;color:#182942;font:16px/1.5 system-ui,sans-serif;padding:24px}
main{width:100%;max-width:430px;background:white;border:1px solid #dce5f1;border-radius:22px;padding:32px;box-shadow:0 16px 50px #142d5510}
.label{color:#3168c6;font-weight:700;font-size:13px;letter-spacing:.07em;text-transform:uppercase}h1{font-size:28px;line-height:1.15;margin:14px 0}p{color:#60718b}label{display:block;font-weight:600;margin:24px 0 8px}
input,button{width:100%;font:inherit;border-radius:11px;padding:13px 15px}input{border:1px solid #b9c8dd}input:focus{outline:3px solid #b9d6ff;border-color:#3168c6}button{border:0;background:#2862c4;color:white;font-weight:650;margin-top:16px;cursor:pointer}
.error{color:#a72232;font-size:14px;min-height:21px;margin-bottom:0}footer{color:#74829a;font-size:12px;margin-top:24px}
</style></head><body><main><div class="label">Mathsite · Scramjet</div><h1>Open your browser</h1>
<p>Enter the access password for this private web proxy.</p><form action="/login" method="post">
<label for="password">Access password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required autofocus>
<button type="submit">Sign in</button><p class="error" role="alert">${message}</p></form>
<footer>Powered by Scramjet and Wisp. Sessions expire after 24 hours or a server restart.</footer></main></body></html>`;
}

/** Creates a server without listening, so the deployment can be tested locally. */
export function createAppServer({
  password = process.env.ACCESS_PASSWORD,
  behindRender = process.env.RENDER === "true",
} = {}) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Set ACCESS_PASSWORD to a password containing at least 12 characters.");
  }

  const passwordDigest = digest(password);
  const sessionSecret = randomBytes(32);
  const failedLogins = new Map();
  const sockets = new Set();
  const app = express();
  app.disable("x-powered-by");
  // Render terminates HTTPS at its reverse proxy. Other hosts use direct TLS
  // unless this option is explicitly configured for their trusted proxy.
  if (behindRender) app.set("trust proxy", 1);

  function signature(payload) {
    return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  }

  function authenticated(request) {
    const cookies = request.headers.cookie || "";
    const entry = cookies.split(";").find((part) => part.trim().startsWith(`${COOKIE_NAME}=`));
    if (!entry) return false;
    const token = entry.trim().slice(COOKIE_NAME.length + 1);
    if (token.length > 512) return false;
    const [payload, provided, extra] = token.split(".");
    if (!payload || !provided || extra) return false;
    const expected = signature(payload);
    const suppliedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return false;
    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString());
      return Number.isSafeInteger(session.exp) && session.exp > Date.now() ? session.exp : false;
    } catch {
      return false;
    }
  }

  function secureRequest(request) {
    if (request.socket.encrypted) return true;
    return behindRender && request.headers["x-forwarded-proto"] === "https";
  }

  function sameOrigin(request) {
    if (typeof request.headers.origin !== "string") return false;
    try {
      const origin = new URL(request.headers.origin);
      const expectedProtocol = secureRequest(request) ? "https:" : "http:";
      return origin.protocol === expectedProtocol && origin.host === request.headers.host;
    } catch {
      return false;
    }
  }

  function cookie(value, request, maxAge = SESSION_SECONDS) {
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureRequest(request) ? "; Secure" : ""}`;
  }

  app.use((request, response, next) => {
    response.set({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    next();
  });

  app.get("/healthz", (_request, response) => response.json({ status: "ok" }));
  app.get("/login", (request, response) => {
    if (authenticated(request)) return response.redirect(303, "/");
    response.type("html").send(loginPage());
  });

  app.post("/login", express.urlencoded({ extended: false, limit: "2kb", parameterLimit: 2 }), (request, response) => {
    if (request.headers.origin && !sameOrigin(request)) return response.sendStatus(403);
    const now = Date.now();
    // Remove expired entries without retaining browsing or credential data.
    for (const [key, value] of failedLogins) {
      if (value.until <= now) failedLogins.delete(key);
    }
    const client = request.ip || request.socket.remoteAddress || "unknown";
    const attempts = failedLogins.get(client);
    if (attempts?.count >= LOGIN_LIMIT) {
      const retryAfter = Math.ceil((attempts.until - now) / 1000);
      return response.status(429).set("Retry-After", String(retryAfter)).type("html")
        .send(loginPage("Too many attempts. Wait a few minutes and try again."));
    }
    const supplied = typeof request.body?.password === "string" ? request.body.password : "";
    if (!timingSafeEqual(digest(supplied), passwordDigest)) {
      if (failedLogins.size >= 10000 && !attempts) {
        return response.status(429).set("Retry-After", "900").type("html")
          .send(loginPage("Sign-in is temporarily busy. Try again shortly."));
      }
      failedLogins.set(client, { count: (attempts?.count || 0) + 1, until: attempts?.until || now + LOGIN_WINDOW_MS });
      return response.status(401).type("html").send(loginPage("That password wasn't correct. Try again."));
    }
    failedLogins.delete(client);
    const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_SECONDS * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
    response.set("Set-Cookie", cookie(`${payload}.${signature(payload)}`, request)).redirect(303, "/");
  });

  app.post("/logout", (request, response) => {
    if (request.headers.origin && !sameOrigin(request)) return response.sendStatus(403);
    response.set("Set-Cookie", cookie("", request, 0)).redirect(303, "/login");
  });

  app.use((request, response, next) => {
    if (authenticated(request)) return next();
    if (request.method === "GET" && request.accepts("html")) return response.redirect(303, "/login");
    response.status(401).json({ error: "Sign in to use this proxy." });
  });

  for (const [prefix, directory] of assetDirectories) {
    app.use(prefix, express.static(directory, { dotfiles: "deny", index: false, redirect: false, cacheControl: false }));
  }
  app.use(express.static(join(root, "public"), { dotfiles: "deny", cacheControl: false }));
  app.use((_request, response) => response.status(404).json({ error: "Not found. Reload the main page if a browsing session expired." }));
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    response.status(status).json({ error: status === 500 ? "Server request failed." : "Invalid request." });
  });

  const server = http.createServer(app);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    function reject(status, label) {
      socket.end(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    }
    if (request.url !== "/wisp/") return reject(404, "Not Found");
    const sessionExpiry = authenticated(request);
    if (!sessionExpiry) return reject(401, "Unauthorized");
    if (!sameOrigin(request)) return reject(403, "Forbidden");
    const expiryTimer = setTimeout(() => socket.destroy(), Math.max(0, sessionExpiry - Date.now()));
    expiryTimer.unref();
    socket.once("close", () => clearTimeout(expiryTimer));
    try {
      wisp.routeRequest(request, socket, head);
    } catch {
      socket.destroy();
    }
  });

  function shutdown() {
    return new Promise((resolve) => {
      server.close(resolve);
      for (const socket of sockets) socket.destroy();
    });
  }
  return { app, server, shutdown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT || 8080);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a valid TCP port number.");
    const { server, shutdown } = createAppServer();
    server.once("error", (error) => {
      console.error(`Server could not start: ${error.code || "unknown error"}`);
      process.exitCode = 1;
    });
    server.listen(port, "0.0.0.0", () => {
      console.log(`Mathsite Scramjet service listening on port ${server.address().port}`);
    });
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => { shutdown().finally(() => process.exit(0)); });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
