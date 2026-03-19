import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: ["$HOME/**"],
  },
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["src/components/menu-section.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
