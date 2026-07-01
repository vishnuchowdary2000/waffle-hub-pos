import { rmSync } from "fs";

for (const f of ["package-lock.json", "yarn.lock"]) {
  rmSync(f, { force: true });
}

const agent = process.env.npm_config_user_agent ?? "";
if (!agent.startsWith("pnpm/")) {
  console.error("Use pnpm instead of npm or yarn.");
  process.exit(1);
}
