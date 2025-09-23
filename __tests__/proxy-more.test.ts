import { getUserIdFromReq, replaceEnvVars, extractPathnameAndQuery, joinPaths, findRouteByPathWithRoutes, type Route, stripNginxHeaders } from '../helpers';
import type * as http from 'http';

describe('getUserIdFromReq', () => {
	function mkReq(headers: Record<string, string>): http.IncomingMessage {
		return { headers } as any;
	}
	it('reads X-User-ID', () => {
		const r = getUserIdFromReq(mkReq({ 'x-user-id': ' abc ' }));
		expect(r).toBe('abc');
	});
	it('reads X_User_ID', () => {
		const r = getUserIdFromReq(mkReq({ 'x_user_id': 'xyz' }));
		expect(r).toBe('xyz');
	});
	it('reads Bearer token', () => {
		const r = getUserIdFromReq(mkReq({ Authorization: 'Bearer token-123' }));
		expect(r).toBe('token-123');
	});
	it('returns null when missing', () => {
		expect(getUserIdFromReq(mkReq({}))).toBeNull();
	});
});

describe('replaceEnvVars', () => {
	const OLD = process.env;
	beforeEach(() => {
		process.env = { ...OLD, A: 'one', B: 'two' } as any;
	});
	afterAll(() => {
		process.env = OLD;
	});
	it('replaces ${VAR} and $VAR in strings', () => {
		expect(replaceEnvVars('x ${A} y $B z')).toBe('x one y two z');
	});
	it('keeps placeholders if env missing', () => {
		expect(replaceEnvVars('val=${MISSING} and $MISSING2')).toBe('val=${MISSING} and $MISSING2');
	});
	it('replaces recursively in objects and arrays', () => {
		const obj = { p: ['${A}', { q: '$B' }] } as any;
		const out = replaceEnvVars(obj);
		expect(out).toEqual({ p: ['one', { q: 'two' }] });
	});
	it('returns non-objects unchanged', () => {
		expect(replaceEnvVars(42 as any)).toBe(42);
		expect(replaceEnvVars(null as any)).toBeNull();
	});
	it('returns empty object unchanged structure', () => {
		expect(replaceEnvVars({})).toEqual({});
	});
});

describe('extractPathnameAndQuery edge cases', () => {
	it('handles path without query', () => {
		const r = extractPathnameAndQuery('/just/path', {} as any);
		expect(r).toEqual({ pathname: '/just/path', search: '' });
	});
	it('handles only query', () => {
		const r = extractPathnameAndQuery('?a=1', {} as any);
		expect(r).toEqual({ pathname: '/', search: '?a=1' });
	});
	it('falls back on malformed absolute URL', () => {
		const r = extractPathnameAndQuery('http://%bad', {} as any);
		expect(r).toEqual({ pathname: 'http://%bad', search: '' });
	});
	it('absolute URL without query', () => {
		const r = extractPathnameAndQuery('https://example.com/path', {} as any);
		expect(r).toEqual({ pathname: '/path', search: '' });
	});
	it('origin-form without leading slash', () => {
		const r = extractPathnameAndQuery('users?id=9', {} as any);
		expect(r).toEqual({ pathname: 'users', search: '?id=9' });
	});
});

describe('joinPaths more cases', () => {
	it('collapses multiple slashes', () => {
		expect(joinPaths('/api/', '/v1//users')).toBe('/api/v1/users');
	});
	it('ensures leading slash', () => {
		expect(joinPaths('api', 'v1')).toBe('/api/v1');
	});
	it('handles empty base', () => {
		expect(joinPaths('', 'v1')).toBe('/v1');
	});
	it('collapses trailing slashes at end', () => {
		expect(joinPaths('/api//', '')).toBe('/api/');
	});
	it('suffix starting with slash and base without trailing slash', () => {
		expect(joinPaths('/api', '/x')).toBe('/api/x');
	});
});

describe('findRouteByPathWithRoutes edge cases', () => {
	function prep(routes: Record<string, Route>): Record<string, Route> {
		for (const r of Object.values(routes)) {
			if (!r.path.startsWith('/')) r.path = '/' + r.path;
			r._prefix = r.path.endsWith('/') ? r.path : r.path + '/';
		}
		return routes;
	}
	it('returns null when no match', () => {
		const routes = prep({ A: { path: '/x', upstream: 'http://x' } });
		const m = findRouteByPathWithRoutes(routes, '/y');
		expect(m).toBeNull();
	});
	it('prefers exact match over prefix', () => {
		const routes = prep({ A: { path: '/a', upstream: 'http://a' }, B: { path: '/a/b', upstream: 'http://b' } });
		const m = findRouteByPathWithRoutes(routes, '/a');
		expect(m?.name).toBe('A');
	});
	it('skips routes with falsy path', () => {
		const routes = { X: { path: '' as any, upstream: 'http://x' } } as any;
		const m = findRouteByPathWithRoutes(routes, '/anything');
		expect(m).toBeNull();
	});
	it('derives prefix when _prefix not set', () => {
		const routes: Record<string, Route> = {
			A: { path: '/api', upstream: 'http://a' }
		};
		const m = findRouteByPathWithRoutes(routes, '/api/users');
		expect(m?.name).toBe('A');
	});
	it('matches exact when _prefix not set', () => {
		const routes: Record<string, Route> = {
			A: { path: '/api', upstream: 'http://a' }
		};
		const m = findRouteByPathWithRoutes(routes, '/api');
		expect(m?.name).toBe('A');
	});
});

describe('stripNginxHeaders additional', () => {
	it('keeps normal headers', () => {
		const h: any = { 'Host': 'x', 'Content-Type': 'y' };
		stripNginxHeaders(h);
		expect(h['Host']).toBe('x');
		expect(h['Content-Type']).toBe('y');
	});
	it('removes mixed-case forwarded headers', () => {
		const h: any = { 'X-ForwArded-Proto': 'https', 'Forwarded': 'by=1', 'host': 'x', 'x-forwarded-for': '1.2.3.4' };
		stripNginxHeaders(h);
		expect(h['X-ForwArded-Proto']).toBeUndefined();
		expect(h['Forwarded']).toBeUndefined();
		expect(h['x-forwarded-for']).toBeUndefined();
		expect(h['host']).toBe('x');
	});
	it('handles empty headers object', () => {
		const h: any = {};
		stripNginxHeaders(h);
		expect(h).toEqual({});
	});
});
