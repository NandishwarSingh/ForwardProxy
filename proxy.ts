// path-proxy.ts
// Node 18+ recommended
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

export interface Route {
  path: string;
  upstream: string;
  PermittedUsers?: string[];
  PermittedMethods?: string[];
  _prefix?: string; // computed field for prefix matching
}

export interface Config {
  Routes: Record<string, Route>;
  AllUsers: string[];
}

interface LogEntry {
  ts: string;
  [key: string]: any;
}

export interface RouteMatch {
  name: string;
  route: Route;
}

export interface PathAndQuery {
  pathname: string;
  search: string;
}

// Load environment variables from .env file if it exists
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
  console.log('Loaded environment variables from .env file');
}

const PORT: number = parseInt(process.env.PORT || '3128', 10);
const CONFIG_PATH: string = process.env.CONFIG || path.join(__dirname, 'config.json');
const LOG_DIR: string = path.join(__dirname, 'logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const ATTEMPT_LOG: string = path.join(LOG_DIR, 'attempts.log');
const ERROR_LOG: string = path.join(LOG_DIR, 'errors.log');

function appendLog(file: string, obj: Omit<LogEntry, 'ts'>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n';
  fs.appendFile(file, line, err => { 
    if (err) console.error('Log write error', err); 
  });
}

// Function to replace environment variables in strings
export function replaceEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    // Replace ${VAR} and $VAR patterns
    return obj.replace(/\$\{([^}]+)\}/g, (match: string, varName: string) => {
      return process.env[varName] || match;
    }).replace(/\$([A-Z_][A-Z0-9_]*)/g, (match: string, varName: string) => {
      return process.env[varName] || match;
    });
  } else if (Array.isArray(obj)) {
    return obj.map(replaceEnvVars);
  } else if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVars(value);
    }
    return result;
  }
  return obj;
}

let config: Config;
try {
  const configText: string = fs.readFileSync(CONFIG_PATH, 'utf8');
  const rawConfig: Config = JSON.parse(configText);
  config = replaceEnvVars(rawConfig);
} catch (e) {
  console.error('Failed to load config:', (e as Error).message);
  process.exit(1);
}

const ROUTES: Record<string, Route> = config.Routes || {};
const ALL_USERS: Set<string> = new Set((config.AllUsers || []).map(String));

// normalize route paths and verify upstreams
for (const [name, r] of Object.entries(ROUTES)) {
  if (!r.path) {
    console.warn(`Route ${name} missing "path"`);
    appendLog(ERROR_LOG, { level: 'warning', msg: 'route_missing_path', route: name });
    continue;
  }
  if (!r.upstream) {
    console.warn(`Route ${name} missing "upstream"`);
    appendLog(ERROR_LOG, { level: 'warning', msg: 'route_missing_upstream', route: name });
  }
  // normalize path to start with '/'
  if (!r.path.startsWith('/')) r.path = '/' + r.path;
  // ensure trailing slash for prefix-match clarity
  if (!r.path.endsWith('/')) r._prefix = r.path + '/';
  else r._prefix = r.path;
  // no modification to upstream here
  // warn about unknown users
  const missing: string[] = (r.PermittedUsers || []).filter(u => !ALL_USERS.has(String(u)));
  if (missing.length) {
    appendLog(ERROR_LOG, { level: 'warning', msg: 'route_users_not_in_allusers', route: name, missing });
  }
}

// headers from nginx to remove before forwarding
const REMOVE_HEADERS: Set<string> = new Set([
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
  'via', 'x-real-ip', 'x-nginx-proxy', 'x-nginx', 'forwarded'
]);

export function stripNginxHeaders(headers: Record<string, any>): void {
  for (const h of Object.keys(headers)) {
    if (REMOVE_HEADERS.has(h.toLowerCase())) delete headers[h];
  }
}

// join two path segments safely
export function joinPaths(basePath: string, suffix: string): string {
  if (!basePath) basePath = '/';
  if (!basePath.endsWith('/')) basePath = basePath + '/';
  if (!suffix) suffix = '';
  if (suffix.startsWith('/')) suffix = suffix.slice(1);
  let combined = (basePath + suffix).replace(/\/+$/g, match => match.length > 1 ? '/' : match); // collapse trailing multiple slashes to one
  combined = combined.replace(/([^:])\/{2,}/g, (_m, p1) => p1 + '/'); // collapse multiple slashes except after protocol colon
  if (!combined.startsWith('/')) combined = '/' + combined;
  return combined;
}

// find best (longest) route match by request pathname
function findRouteByPath(pathname: string): RouteMatch | null {
  let best: RouteMatch | null = null;
  let bestLen = -1;
  for (const [name, r] of Object.entries(ROUTES)) {
    if (!r.path) continue;
    // two prefix forms: exact path or prefix with trailing slash
    const prefix = r._prefix || (r.path.endsWith('/') ? r.path : r.path + '/');
    if (pathname === r.path || pathname.startsWith(prefix)) {
      if (r.path.length > bestLen) {
        best = { name, route: r };
        bestLen = r.path.length;
      }
    }
  }
  return best;
}

// pure helper for testing route matching with provided routes
export function findRouteByPathWithRoutes(routes: Record<string, Route>, pathname: string): RouteMatch | null {
  let best: RouteMatch | null = null;
  let bestLen = -1;
  for (const [name, r] of Object.entries(routes)) {
    if (!r.path) continue;
    const prefix = r._prefix || (r.path.endsWith('/') ? r.path : r.path + '/');
    if (pathname === r.path || pathname.startsWith(prefix)) {
      if (r.path.length > bestLen) {
        best = { name, route: r };
        bestLen = r.path.length;
      }
    }
  }
  return best;
}

export function extractPathnameAndQuery(reqUrl: string, headers: http.IncomingHttpHeaders): PathAndQuery {
  try {
    if (/^https?:\/\//i.test(reqUrl)) {
      const u = new URL(reqUrl);
      return { pathname: u.pathname, search: u.search };
    } else {
      // origin-form or absolute path: may include query
      const [p, q] = reqUrl.split('?', 2);
      return { pathname: p || '/', search: q ? '?' + q : '' };
    }
  } catch (e) {
    // fallback
    const [p, q] = reqUrl.split('?', 2);
    return { pathname: p || '/', search: q ? '?' + q : '' };
  }
}

export function getUserIdFromReq(req: http.IncomingMessage): string | null {
  const fromHeader = req.headers['x-user-id'] || req.headers['x_user_id'];
  if (fromHeader) return String(fromHeader).trim();
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  (async (): Promise<void> => {
    const clientIp: string | undefined = req.socket.remoteAddress;
    const userId: string | null = getUserIdFromReq(req);
    const { pathname, search }: PathAndQuery = extractPathnameAndQuery(req.url || '', req.headers);

    const match: RouteMatch | null = findRouteByPath(pathname);
    if (!match) {
      appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'no_route', clientIp, method: req.method, url: req.url, userId });
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: no matching route for path');
      return;
    }

    if (!userId || !ALL_USERS.has(userId)) {
      appendLog(ATTEMPT_LOG, { action: 'denied', reason: !userId ? 'missing_user' : 'unknown_user', clientIp, method: req.method, url: req.url, route: match.name, userId });
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized: missing or unknown user');
      return;
    }

    const permittedUsers: Set<string> = new Set((match.route.PermittedUsers || []).map(String));
    if (!permittedUsers.has(userId)) {
      appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'user_not_permitted_for_route', clientIp, method: req.method, url: req.url, route: match.name, userId });
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: user not permitted for this route');
      return;
    }

    const allowedMethods: Set<string> = new Set((match.route.PermittedMethods || []).map(m => m.toUpperCase()));
    if (!allowedMethods.has((req.method || '').toUpperCase())) {
      appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'method_not_allowed', clientIp, method: req.method, url: req.url, route: match.name, userId });
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed for this route');
      return;
    }

    // Build destination URL: route.upstream + suffix path + original query
    try {
      if (!match.route.upstream) throw new Error('upstream_not_configured');
      const upstream = new URL(match.route.upstream);
      // calculate suffix path after route.path
      let suffix = '/';
      if (pathname === match.route.path) suffix = '/';
      else if (pathname.startsWith(match.route._prefix!)) suffix = pathname.slice(match.route.path.length);
      else if (pathname.startsWith(match.route.path)) suffix = pathname.slice(match.route.path.length);
      // ensure suffix starts with '/'
      if (!suffix.startsWith('/')) suffix = '/' + suffix;
      upstream.pathname = joinPaths(upstream.pathname, suffix);
      upstream.search = search || '';
      const destUrl = upstream;

      // prepare options
      const options: http.RequestOptions = {
        protocol: destUrl.protocol,
        hostname: destUrl.hostname,
        port: destUrl.port || (destUrl.protocol === 'https:' ? 443 : 80),
        path: destUrl.pathname + destUrl.search,
        method: req.method,
        headers: { ...req.headers }
      };

      // strip nginx-added headers and hop-by-hop
      stripNginxHeaders(options.headers as Record<string, any>);
      delete (options.headers as any)['proxy-connection'];
      delete (options.headers as any)['connection'];
      // set Host to upstream host
      (options.headers as any)['host'] = destUrl.host;

      const client = destUrl.protocol === 'https:' ? https : http;
      const upstreamReq = client.request(options, (upstreamRes: http.IncomingMessage) => {
        // forward status and headers (strip hop-by-hop and nginx headers)
        const respHeaders = { ...upstreamRes.headers };
        for (const h of Object.keys(respHeaders)) {
          if (REMOVE_HEADERS.has(h.toLowerCase()) || 
              h.toLowerCase() === 'connection' || 
              h.toLowerCase() === 'transfer-encoding') {
            delete respHeaders[h];
          }
        }
        res.writeHead(upstreamRes.statusCode || 500, respHeaders);
        upstreamRes.pipe(res, { end: true });
      });

      upstreamReq.on('error', (err: Error) => {
        appendLog(ERROR_LOG, { level: 'error', msg: 'upstream_request_error', error: err.message, route: match.name, dest: destUrl.href, userId, clientIp });
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      });

      // pipe request body
      req.pipe(upstreamReq, { end: true });
    } catch (e) {
      appendLog(ERROR_LOG, { level: 'error', msg: 'prepare_forward_failed', error: (e as Error).message, route: match.name, userId, clientIp });
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  })();
});

// Keep existing CONNECT handling (tunneling) — unchanged semantics but you can
// restrict by mapping CONNECT target host to a route if you like.
server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
  const clientIp: string | undefined = clientSocket.remoteAddress;
  // Extract userId if present in headers of CONNECT (some clients may not send)
  const h = req.headers || {};
  const userId: string | null = (h['x-user-id'] || h['x_user_id'] || 
    (h['authorization'] && typeof h['authorization'] === 'string' && 
     h['authorization'].toLowerCase().startsWith('bearer ') ? 
     h['authorization'].slice(7).trim() : null)) as string | null;

  const [targetHost, targetPort] = (req.url || '').split(':');

  // We allow CONNECT only if any route upstream hostname matches targetHost
  let matched: RouteMatch | null = null;
  for (const [name, r] of Object.entries(ROUTES)) {
    try {
      const u = new URL(r.upstream);
      if (u.hostname === targetHost) { 
        matched = { name, route: r }; 
        break; 
      }
    } catch (e) {}
  }

  if (!matched) {
    appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'no_route_for_connect', clientIp, connectHost: req.url, userId });
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    clientSocket.end();
    return;
  }

  if (!userId || !ALL_USERS.has(userId)) {
    appendLog(ATTEMPT_LOG, { action: 'denied', reason: !userId ? 'missing_user' : 'unknown_user', clientIp, connectHost: req.url, route: matched.name, userId });
    clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    clientSocket.end();
    return;
  }

  const permittedUsers: Set<string> = new Set((matched.route.PermittedUsers || []).map(String));
  if (!permittedUsers.has(userId)) {
    appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'user_not_permitted_for_connect', clientIp, connectHost: req.url, route: matched.name, userId });
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    clientSocket.end();
    return;
  }

  // allow CONNECT only if route permitted methods includes CONNECT
  const allowedMethods: Set<string> = new Set((matched.route.PermittedMethods || []).map(m => m.toUpperCase()));
  if (!allowedMethods.has('CONNECT')) {
    appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'connect_not_allowed', clientIp, connectHost: req.url, route: matched.name, userId });
    clientSocket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
    clientSocket.end();
    return;
  }

  const serverSocket = net.connect(parseInt(targetPort) || 443, targetHost, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                       'Proxy-agent: Path-Proxy\r\n' +
                       '\r\n');
    if (head && head.length) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err: Error) => {
    appendLog(ERROR_LOG, { level: 'error', msg: 'connect_upstream_error', error: err.message, connectHost: req.url, route: matched!.name, userId });
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.end();
  });
});

server.on('clientError', (err: Error, socket: net.Socket) => {
  appendLog(ERROR_LOG, { level: 'error', msg: 'client_error', error: err.message });
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Path-based proxy listening on ${PORT}`);
    appendLog(ERROR_LOG, { level: 'info', msg: 'proxy_started', port: PORT });
  });
}

export const __internals = {
  REMOVE_HEADERS,
};