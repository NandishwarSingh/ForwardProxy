"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// path-proxy.ts
// Node 18+ recommended
var http = require("http");
var https = require("https");
var net = require("net");
var fs = require("fs");
var path = require("path");
var url_1 = require("url");
// Load environment variables from .env file if it exists
var envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
    var envContent = fs.readFileSync(envFile, 'utf8');
    envContent.split('\n').forEach(function (line) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            var _a = line.split('='), key = _a[0], valueParts = _a.slice(1);
            if (key && valueParts.length > 0) {
                var value = valueParts.join('=');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        }
    });
    console.log('Loaded environment variables from .env file');
}
var PORT = parseInt(process.env.PORT || '3128', 10);
var CONFIG_PATH = process.env.CONFIG || path.join(__dirname, 'config.json');
var LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR))
    fs.mkdirSync(LOG_DIR, { recursive: true });
var ATTEMPT_LOG = path.join(LOG_DIR, 'attempts.log');
var ERROR_LOG = path.join(LOG_DIR, 'errors.log');
function appendLog(file, obj) {
    var line = JSON.stringify(__assign({ ts: new Date().toISOString() }, obj)) + '\n';
    fs.appendFile(file, line, function (err) {
        if (err)
            console.error('Log write error', err);
    });
}
// Function to replace environment variables in strings
function replaceEnvVars(obj) {
    if (typeof obj === 'string') {
        // Replace ${VAR} and $VAR patterns
        return obj.replace(/\$\{([^}]+)\}/g, function (match, varName) {
            return process.env[varName] || match;
        }).replace(/\$([A-Z_][A-Z0-9_]*)/g, function (match, varName) {
            return process.env[varName] || match;
        });
    }
    else if (Array.isArray(obj)) {
        return obj.map(replaceEnvVars);
    }
    else if (obj && typeof obj === 'object') {
        var result = {};
        for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            result[key] = replaceEnvVars(value);
        }
        return result;
    }
    return obj;
}
var config;
try {
    var configText = fs.readFileSync(CONFIG_PATH, 'utf8');
    var rawConfig = JSON.parse(configText);
    config = replaceEnvVars(rawConfig);
}
catch (e) {
    console.error('Failed to load config:', e.message);
    process.exit(1);
}
var ROUTES = config.Routes || {};
var ALL_USERS = new Set((config.AllUsers || []).map(String));
// normalize route paths and verify upstreams
for (var _i = 0, _a = Object.entries(ROUTES); _i < _a.length; _i++) {
    var _b = _a[_i], name_1 = _b[0], r = _b[1];
    if (!r.path) {
        console.warn("Route ".concat(name_1, " missing \"path\""));
        appendLog(ERROR_LOG, { level: 'warning', msg: 'route_missing_path', route: name_1 });
        continue;
    }
    if (!r.upstream) {
        console.warn("Route ".concat(name_1, " missing \"upstream\""));
        appendLog(ERROR_LOG, { level: 'warning', msg: 'route_missing_upstream', route: name_1 });
    }
    // normalize path to start with '/'
    if (!r.path.startsWith('/'))
        r.path = '/' + r.path;
    // ensure trailing slash for prefix-match clarity
    if (!r.path.endsWith('/'))
        r._prefix = r.path + '/';
    else
        r._prefix = r.path;
    // no modification to upstream here
    // warn about unknown users
    var missing = (r.PermittedUsers || []).filter(function (u) { return !ALL_USERS.has(String(u)); });
    if (missing.length) {
        appendLog(ERROR_LOG, { level: 'warning', msg: 'route_users_not_in_allusers', route: name_1, missing: missing });
    }
}
// headers from nginx to remove before forwarding
var REMOVE_HEADERS = new Set([
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
    'via', 'x-real-ip', 'x-nginx-proxy', 'x-nginx', 'forwarded'
]);
function stripNginxHeaders(headers) {
    for (var _i = 0, _a = Object.keys(headers); _i < _a.length; _i++) {
        var h = _a[_i];
        if (REMOVE_HEADERS.has(h.toLowerCase()))
            delete headers[h];
    }
}
// join two path segments safely
function joinPaths(basePath, suffix) {
    if (!basePath)
        basePath = '/';
    if (!basePath.endsWith('/'))
        basePath = basePath + '/';
    if (!suffix)
        suffix = '';
    if (suffix.startsWith('/'))
        suffix = suffix.slice(1);
    var combined = '/' + (basePath + suffix).replace(/\/+/g, '/');
    return combined;
}
// find best (longest) route match by request pathname
function findRouteByPath(pathname) {
    var best = null;
    var bestLen = -1;
    for (var _i = 0, _a = Object.entries(ROUTES); _i < _a.length; _i++) {
        var _b = _a[_i], name_2 = _b[0], r = _b[1];
        if (!r.path)
            continue;
        // two prefix forms: exact path or prefix with trailing slash
        var prefix = r._prefix || (r.path.endsWith('/') ? r.path : r.path + '/');
        if (pathname === r.path || pathname.startsWith(prefix)) {
            if (r.path.length > bestLen) {
                best = { name: name_2, route: r };
                bestLen = r.path.length;
            }
        }
    }
    return best;
}
function extractPathnameAndQuery(reqUrl, headers) {
    try {
        if (/^https?:\/\//i.test(reqUrl)) {
            var u = new url_1.URL(reqUrl);
            return { pathname: u.pathname, search: u.search };
        }
        else {
            // origin-form or absolute path: may include query
            var _a = reqUrl.split('?', 2), p = _a[0], q = _a[1];
            return { pathname: p || '/', search: q ? '?' + q : '' };
        }
    }
    catch (e) {
        // fallback
        var _b = reqUrl.split('?', 2), p = _b[0], q = _b[1];
        return { pathname: p || '/', search: q ? '?' + q : '' };
    }
}
function getUserIdFromReq(req) {
    var fromHeader = req.headers['x-user-id'] || req.headers['x_user_id'];
    if (fromHeader)
        return String(fromHeader).trim();
    var auth = req.headers['authorization'] || req.headers['Authorization'];
    if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    return null;
}
var server = http.createServer(function (req, res) {
    (function () { return __awaiter(void 0, void 0, void 0, function () {
        var clientIp, userId, _a, pathname, search, match, permittedUsers, allowedMethods, upstream, suffix, destUrl_1, forwardHeaders, options, client, upstreamReq;
        return __generator(this, function (_b) {
            clientIp = req.socket.remoteAddress;
            userId = getUserIdFromReq(req);
            _a = extractPathnameAndQuery(req.url || '', req.headers), pathname = _a.pathname, search = _a.search;
            match = findRouteByPath(pathname);
            if (!match) {
                appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'no_route', clientIp: clientIp, method: req.method, url: req.url, userId: userId });
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden: no matching route for path');
                return [2 /*return*/];
            }
            if (!userId || !ALL_USERS.has(userId)) {
                appendLog(ATTEMPT_LOG, { action: 'denied', reason: !userId ? 'missing_user' : 'unknown_user', clientIp: clientIp, method: req.method, url: req.url, route: match.name, userId: userId });
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Unauthorized: missing or unknown user');
                return [2 /*return*/];
            }
            permittedUsers = new Set((match.route.PermittedUsers || []).map(String));
            if (!permittedUsers.has(userId)) {
                appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'user_not_permitted_for_route', clientIp: clientIp, method: req.method, url: req.url, route: match.name, userId: userId });
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden: user not permitted for this route');
                return [2 /*return*/];
            }
            allowedMethods = new Set((match.route.PermittedMethods || []).map(function (m) { return m.toUpperCase(); }));
            if (!allowedMethods.has((req.method || '').toUpperCase())) {
                appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'method_not_allowed', clientIp: clientIp, method: req.method, url: req.url, route: match.name, userId: userId });
                res.writeHead(405, { 'Content-Type': 'text/plain' });
                res.end('Method Not Allowed for this route');
                return [2 /*return*/];
            }
            // Build destination URL: route.upstream + suffix path + original query
            try {
                if (!match.route.upstream)
                    throw new Error('upstream_not_configured');
                upstream = new url_1.URL(match.route.upstream);
                suffix = '/';
                if (pathname === match.route.path)
                    suffix = '/';
                else if (pathname.startsWith(match.route._prefix))
                    suffix = pathname.slice(match.route.path.length);
                else if (pathname.startsWith(match.route.path))
                    suffix = pathname.slice(match.route.path.length);
                // ensure suffix starts with '/'
                if (!suffix.startsWith('/'))
                    suffix = '/' + suffix;
                upstream.pathname = joinPaths(upstream.pathname, suffix);
                upstream.search = search || '';
                destUrl_1 = upstream;
                forwardHeaders = __assign({}, req.headers);
                // strip nginx-added headers and hop-by-hop
                stripNginxHeaders(forwardHeaders);
                delete forwardHeaders['proxy-connection'];
                delete forwardHeaders['connection'];
                // set Host to upstream host
                forwardHeaders['host'] = destUrl_1.host;
                options = {
                    protocol: destUrl_1.protocol,
                    hostname: destUrl_1.hostname,
                    port: destUrl_1.port || (destUrl_1.protocol === 'https:' ? 443 : 80),
                    path: destUrl_1.pathname + destUrl_1.search,
                    method: req.method,
                    headers: forwardHeaders
                };
                client = destUrl_1.protocol === 'https:' ? https : http;
                upstreamReq = client.request(options, function (upstreamRes) {
                    // forward status and headers (strip hop-by-hop and nginx headers)
                    var respHeaders = __assign({}, upstreamRes.headers);
                    for (var _i = 0, _a = Object.keys(respHeaders); _i < _a.length; _i++) {
                        var h = _a[_i];
                        if (REMOVE_HEADERS.has(h.toLowerCase()) ||
                            h.toLowerCase() === 'connection' ||
                            h.toLowerCase() === 'transfer-encoding') {
                            delete respHeaders[h];
                        }
                    }
                    res.writeHead(upstreamRes.statusCode || 500, respHeaders);
                    upstreamRes.pipe(res, { end: true });
                });
                upstreamReq.on('error', function (err) {
                    appendLog(ERROR_LOG, { level: 'error', msg: 'upstream_request_error', error: err.message, route: match.name, dest: destUrl_1.href, userId: userId, clientIp: clientIp });
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway');
                });
                // pipe request body
                req.pipe(upstreamReq, { end: true });
            }
            catch (e) {
                appendLog(ERROR_LOG, { level: 'error', msg: 'prepare_forward_failed', error: e.message, route: match.name, userId: userId, clientIp: clientIp });
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
            return [2 /*return*/];
        });
    }); })();
});
// Keep existing CONNECT handling (tunneling) — unchanged semantics but you can
// restrict by mapping CONNECT target host to a route if you like.
server.on('connect', function (req, clientSocket, head) {
    var clientIp = clientSocket.remoteAddress;
    // Extract userId if present in headers of CONNECT (some clients may not send)
    var h = req.headers || {};
    var userId = (h['x-user-id'] || h['x_user_id'] ||
        (h['authorization'] && typeof h['authorization'] === 'string' &&
            h['authorization'].toLowerCase().startsWith('bearer ') ?
            h['authorization'].slice(7).trim() : null));
    var _a = (req.url || '').split(':'), targetHost = _a[0], targetPort = _a[1];
    // We allow CONNECT only if any route upstream hostname matches targetHost
    var matched = null;
    for (var _i = 0, _b = Object.entries(ROUTES); _i < _b.length; _i++) {
        var _c = _b[_i], name_3 = _c[0], r = _c[1];
        try {
            var u = new url_1.URL(r.upstream);
            if (u.hostname === targetHost) {
                matched = { name: name_3, route: r };
                break;
            }
        }
        catch (e) { }
    }
    if (!matched) {
        appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'no_route_for_connect', clientIp: clientIp, connectHost: req.url, userId: userId });
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
    }
    if (!userId || !ALL_USERS.has(userId)) {
        appendLog(ATTEMPT_LOG, { action: 'denied', reason: !userId ? 'missing_user' : 'unknown_user', clientIp: clientIp, connectHost: req.url, route: matched.name, userId: userId });
        clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        clientSocket.end();
        return;
    }
    var permittedUsers = new Set((matched.route.PermittedUsers || []).map(String));
    if (!permittedUsers.has(userId)) {
        appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'user_not_permitted_for_connect', clientIp: clientIp, connectHost: req.url, route: matched.name, userId: userId });
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
    }
    // allow CONNECT only if route permitted methods includes CONNECT
    var allowedMethods = new Set((matched.route.PermittedMethods || []).map(function (m) { return m.toUpperCase(); }));
    if (!allowedMethods.has('CONNECT')) {
        appendLog(ATTEMPT_LOG, { action: 'denied', reason: 'connect_not_allowed', clientIp: clientIp, connectHost: req.url, route: matched.name, userId: userId });
        clientSocket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
        clientSocket.end();
        return;
    }
    var serverSocket = net.connect(parseInt(targetPort) || 443, targetHost, function () {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Path-Proxy\r\n' +
            '\r\n');
        if (head && head.length)
            serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });
    serverSocket.on('error', function (err) {
        appendLog(ERROR_LOG, { level: 'error', msg: 'connect_upstream_error', error: err.message, connectHost: req.url, route: matched.name, userId: userId });
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
    });
});
server.on('clientError', function (err, socket) {
    appendLog(ERROR_LOG, { level: 'error', msg: 'client_error', error: err.message });
    if (socket.writable)
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.listen(PORT, function () {
    console.log("Path-based proxy listening on ".concat(PORT));
    appendLog(ERROR_LOG, { level: 'info', msg: 'proxy_started', port: PORT });
});
