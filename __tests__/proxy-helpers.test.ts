import { extractPathnameAndQuery, joinPaths, stripNginxHeaders, findRouteByPathWithRoutes, type Route } from '../proxy';

describe('extractPathnameAndQuery', () => {
	it('parses absolute URL', () => {
		const r = extractPathnameAndQuery('https://example.com/a/b?x=1', {} as any);
		expect(r).toEqual({ pathname: '/a/b', search: '?x=1' });
	});
	it('parses origin-form with query', () => {
		const r = extractPathnameAndQuery('/api/v1/users?id=42', {} as any);
		expect(r).toEqual({ pathname: '/api/v1/users', search: '?id=42' });
	});
	it('defaults to root when empty', () => {
		const r = extractPathnameAndQuery('', {} as any);
		expect(r).toEqual({ pathname: '/', search: '' });
	});
});

describe('joinPaths', () => {
	it('joins with single slash', () => {
		expect(joinPaths('/api', '/v1/users')).toBe('/api/v1/users');
		expect(joinPaths('/api/', '/v1/users')).toBe('/api/v1/users');
		expect(joinPaths('/api', 'v1/users')).toBe('/api/v1/users');
	});
	it('handles empty suffix', () => {
		expect(joinPaths('/api', '')).toBe('/api/');
	});
});

describe('stripNginxHeaders', () => {
	it('removes x-forwarded and hop-by-hop headers', () => {
		const h: any = {
			'X-Forwarded-For': '1.2.3.4',
			'Connection': 'keep-alive',
			'Via': '1.1 something',
			'Host': 'example.com',
			'Content-Type': 'application/json'
		};
		stripNginxHeaders(h);
		expect(h['X-Forwarded-For']).toBeUndefined();
		expect(h['Via']).toBeUndefined();
	});
});

describe('findRouteByPathWithRoutes', () => {
	function prep(routes: Record<string, Route>): Record<string, Route> {
		for (const r of Object.values(routes)) {
			if (!r.path.startsWith('/')) r.path = '/' + r.path;
			r._prefix = r.path.endsWith('/') ? r.path : r.path + '/';
		}
		return routes;
	}
	it('matches exact and longest prefix', () => {
		const routes = prep({
			A: { path: '/api', upstream: 'https://a' },
			B: { path: '/api/v1', upstream: 'https://b' }
		});
		const m1 = findRouteByPathWithRoutes(routes, '/api');
		expect(m1?.name).toBe('A');
		const m2 = findRouteByPathWithRoutes(routes, '/api/v1/users');
		expect(m2?.name).toBe('B');
	});
});
