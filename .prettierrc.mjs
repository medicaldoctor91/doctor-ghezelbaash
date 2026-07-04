export default {
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 120,
  plugins: ['prettier-plugin-astro'],
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
  ],
};
