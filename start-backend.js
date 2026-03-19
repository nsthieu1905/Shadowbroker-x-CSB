const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const backendDir = path.resolve(__dirname, "backend");
const venvBin =
  process.platform === "win32"
    ? path.join(backendDir, "venv", "Scripts", "python.exe")
    : path.join(backendDir, "venv", "bin", "python3");

if (!fs.existsSync(venvBin)) {
  console.warn(`[!] Python venv not found at: ${venvBin}`);
  console.warn(
    "[!] Skipping backend auto-start. Run start.sh (Mac/Linux) or start.bat (Windows) first to create the venv, or start the backend manually.",
  );
  process.exit(0);
}

console.log(`[*] Starting backend with: ${venvBin}`);
execSync(`"${venvBin}" -m uvicorn main:app --reload --port 8036`, {
  cwd: backendDir,
  stdio: "inherit",
});
