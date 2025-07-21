import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import pulumiPlugin from '@pulumi/eslint-plugin';

export default [
  // Base configuration for all files
  js.configs.recommended,
  
  // TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        globalThis: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@pulumi': pulumiPlugin,
    },
    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
      }],
      
      // Pulumi-specific rules
      '@pulumi/no-output-in-template-literal': 'error',
      '@pulumi/no-output-instance-in-template-literal': 'error',

      // General JavaScript/TypeScript rules
      'no-console': 'off', // Allow console in infrastructure code
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files configuration
  {
    files: ['test/**/*.ts', '**/*.test.ts'],
    languageOptions: {
      globals: {
        // Mocha globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Relax some rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off', // For Chai expect assertions
      '@pulumi/no-output-in-template-literal': 'warn',
      '@pulumi/no-output-instance-in-template-literal': 'warn',
    },
  },

  // JavaScript files configuration
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },

  // Configuration for policy and static files
  {
    files: ['test/static/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off', // Policy validation functions may be unused
    },
  },

  {
    files: ['components/VectorStore.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for dynamic vector store types
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'index-old.ts', // Ignore old files
      'lambda/**/*.js', // Lambda build artifacts
      'coverage/',
    ],
  },
];