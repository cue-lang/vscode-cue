import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(eslint.configs.recommended, tseslint.configs.recommended, {
	rules: {
		'@typescript-eslint/naming-convention': [
			'warn',
			{
				selector: 'import',
				format: ['camelCase', 'PascalCase']
			}
		],
		// The extension deliberately uses 'any' in command-handler
		// signatures; see the comment on Extension.registerCommand.
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		curly: 'warn',
		eqeqeq: ['error', 'always'],
		'no-throw-literal': 'warn',
		// destructuring 'all': the Go-style '[x, err] = await ve(...)'
		// assignments in this codebase reuse 'err' across several
		// destructuring patterns; only flag a pattern when every variable
		// in it could be const.
		'prefer-const': ['warn', { destructuring: 'all' }]
	}
});
