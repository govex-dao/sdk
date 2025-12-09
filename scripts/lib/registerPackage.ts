import { execSync } from "child_process";
import * as path from "path";

export async function registerPackages(): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("REGISTER PACKAGES IN PACKAGE REGISTRY");
  console.log("=".repeat(80));
  try {
    execSync("npx tsx scripts/register-new-packages.ts", {
      cwd: path.join(__dirname, "../.."),
      encoding: "utf8",
      stdio: "inherit",
    });
    console.log("✅ Package registration completed");
  } catch (error: any) {
    console.log(
      "⚠️  Package registration failed (may already be registered):",
      error.message,
    );
  }
}
