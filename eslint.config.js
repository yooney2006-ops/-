// 새로 쓴 TypeScript와 검사 스크립트만 린트한다. 아티팩트에서 옮긴 화면 코드(@ts-nocheck)와 3D 엔진은 한 줄짜리 압축 스타일이라 제외.
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["dist/**", "dev-dist/**", "node_modules/**", "src/engine/**", "src/data/**", "tests/physics/**", "tools/**",
      "src/app/actions.ts", "src/app/views.ts", "src/app/sheets.ts", "src/app/training.ts", "src/app/goals.ts", "src/app/util.ts", "src/app/catalog.ts"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/ban-ts-comment": "off", "@typescript-eslint/no-unused-expressions": "off" } },
);
