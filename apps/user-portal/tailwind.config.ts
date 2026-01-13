import baseConfig from "@imaginecalendar/ui/tailwind.config";
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [baseConfig],
  theme: {
    extend: {
      colors: {
        white: "rgb(252 252 252)",
      },
    },
  },
} satisfies Config;