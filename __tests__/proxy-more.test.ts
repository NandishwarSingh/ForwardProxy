import { getUserIdFromReq, replaceEnvVars, extractPathnameAndQuery, joinPaths, findRouteByPathWithRoutes, type Route, stripNginxHeaders } from '../proxy';
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
		process.env = { ...OLD, A: 'one', B: 'two' };
	});
	afterAll(() => {
		process.env = OLD;
	});
	it('replaces ${VAR} and $VAR in strings', () => {
		expect(replaceEnvVars('x ${A} y $B z')).toBe('x one y two z');
	});
	it('replaces recursively in objects and arrays', () => {
		const obj = { p: ['${A}', { q: '$B' }] } as any;
		const out = replaceEnvVars(obj);
		expect(out).toEqual({ p: ['one', { q: 'two' }] });
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
});

describe('joinPaths more cases', () => {
	it('collapses multiple slashes', () => {
		expect(joinPaths('/api/', '/v1//users')).toBe('/api/v1/users');
	});
	it('ensures leading slash', () => {
		expect(joinPaths('api', 'v1')).toBe('/api/v1');
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
});

describe('stripNginxHeaders additional', () => {
	it('keeps normal headers', () => {
		const h: any = { 'Host': 'x', 'Content-Type': 'y' };
		stripNginxHeaders(h);
		expect(h['Host']).toBe('x');
		expect(h['Content-Type']).toBe('y');
	});
});
