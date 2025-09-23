import { URL } from 'url';

export interface Route {
	path: string;
	upstream: string;
	PermittedUsers?: string[];
	PermittedMethods?: string[];
	_prefix?: string;
}

export interface RouteMatch {
	name: string;
	route: Route;
}

export interface PathAndQuery {
	pathname: string;
	search: string;
}

export function replaceEnvVars(obj: any): any {
	if (typeof obj === 'string') {
		return obj.replace(/\$\{([^}]+)\}/g, (_m: string, varName: string) => {
			return process.env[varName] || _m;
		}).replace(/\$([A-Z_][A-Z0-9_]*)/g, (_m: string, varName: string) => {
			return process.env[varName] || _m;
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

const REMOVE_HEADERS: Set<string> = new Set([
	'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
	'via', 'x-real-ip', 'x-nginx-proxy', 'x-nginx', 'forwarded'
]);

export function stripNginxHeaders(headers: Record<string, any>): void {
	for (const h of Object.keys(headers)) {
		if (REMOVE_HEADERS.has(h.toLowerCase())) delete headers[h];
	}
}

export function joinPaths(basePath: string, suffix: string): string {
	if (!basePath) basePath = '/';
	if (!basePath.endsWith('/')) basePath = basePath + '/';
	if (!suffix) suffix = '';
	if (suffix.startsWith('/')) suffix = suffix.slice(1);
	let combined = (basePath + suffix).replace(/\/+$/g, match => match.length > 1 ? '/' : match);
	combined = combined.replace(/([^:])\/{2,}/g, (_m, p1) => p1 + '/');
	if (!combined.startsWith('/')) combined = '/' + combined;
	return combined;
}

export function extractPathnameAndQuery(reqUrl: string, _headers: Record<string, unknown>): PathAndQuery {
	try {
		if (/^https?:\/\//i.test(reqUrl)) {
			const u = new URL(reqUrl);
			return { pathname: u.pathname, search: u.search };
		} else {
			const [p, q] = reqUrl.split('?', 2);
			return { pathname: p || '/', search: q ? '?' + q : '' };
		}
	} catch {
		const [p, q] = reqUrl.split('?', 2);
		return { pathname: p || '/', search: q ? '?' + q : '' };
	}
}

export function getUserIdFromReq(req: { headers: Record<string, any> }): string | null {
	const fromHeader = req.headers['x-user-id'] || req.headers['x_user_id'];
	if (fromHeader) return String(fromHeader).trim();
	const auth = req.headers['authorization'] || req.headers['Authorization'];
	if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
		return auth.slice(7).trim();
	}
	return null;
}

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

export const __internals = { REMOVE_HEADERS };
