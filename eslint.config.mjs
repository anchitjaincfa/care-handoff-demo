import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTs, globalIgnores([".next/**","out/**","coverage/**"]),
  { files:["src/domain/**/*.{ts,tsx}"], rules:{ "no-restricted-imports":["error",{ patterns:["react","react/*","@/app/*","@/src/adapters/*","**/adapters/**","**/app/**"] }] } },
  { files:["app/**/*.tsx","src/features/**/*.tsx","src/components/**/*.tsx"], rules:{ "no-restricted-syntax":["error",{ selector:"JSXText[value=/\\S/]", message:"Move user-facing text into src/copy/." }] } },
]);
