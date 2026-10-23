import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this smoke test through npm run test:package");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} exited with ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }

  return result;
}

function runNpm(args) {
  return run(process.execPath, [npmCli, ...args]);
}

const tempDir = mkdtempSync(join(tmpdir(), "starterqueue-package-"));
const packDir = join(tempDir, "pack");
const installDir = join(tempDir, "install");
mkdirSync(packDir);
mkdirSync(installDir);

try {
  const packed = runNpm(["pack", "--silent", "--pack-destination", packDir]);
  const tarballName = packed.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!tarballName) throw new Error("npm pack did not return a tarball name");

  const tarballPath = resolve(packDir, tarballName);

  runNpm([
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    installDir,
    tarballPath,
  ]);

  const packageDir = join(installDir, "node_modules", ...packageJson.name.split("/"));
  const installedPackage = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );

  if (installedPackage.bin?.starterqueue !== "dist/src/cli.js") {
    throw new Error("Packed package does not expose the expected starterqueue binary");
  }

  const cliPath = join(packageDir, installedPackage.bin.starterqueue);
  const cli = spawnSync(process.execPath, [cliPath], { encoding: "utf8" });
  if (cli.error) throw cli.error;

  const output = `${cli.stdout ?? ""}${cli.stderr ?? ""}`;
  if (cli.status !== 1 || !output.includes("Usage:")) {
    throw new Error([
      `Packed CLI smoke test failed with exit ${cli.status}`,
      output,
    ].filter(Boolean).join("\n"));
  }

  console.log(`Packed CLI smoke test passed for ${packageJson.name}@${packageJson.version}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
