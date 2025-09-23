module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	coverageDirectory: 'coverage',
	collectCoverageFrom: ['helpers.ts'],
	coveragePathIgnorePatterns: [
		"/node_modules/"
	],
	coverageThreshold: {
		global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90
		}
	},
	moduleFileExtensions: ['ts', 'js', 'json'],
	verbose: false
};
