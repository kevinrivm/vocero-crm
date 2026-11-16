import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "drizzle/**",
      "scripts/**",
      "next-env.d.ts",
      ".tmp-seed-demo.mjs",
      ".tmp-*.mjs",
      ".tmp/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
