import type { Config } from 'jest';

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	coverageDirectory: 'coverage',
	collectCoverageFrom: ['proxy.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	verbose: false
};

export default config;
