export async function gitExec(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${exitCode}): ${stderr.trim()}`,
    );
  }

  return stdout.trim();
}

export async function createBranch(
  branchName: string,
  cwd: string,
): Promise<void> {
  await gitExec(["checkout", "-b", branchName], cwd);
}

export async function checkoutBranch(
  branchName: string,
  cwd: string,
): Promise<void> {
  await gitExec(["checkout", branchName], cwd);
}

export async function checkoutMain(cwd: string): Promise<void> {
  await gitExec(["checkout", "main"], cwd);
}

export async function commitFile(
  filePath: string,
  message: string,
  author: string,
  cwd: string,
): Promise<void> {
  await gitExec(["add", filePath], cwd);
  await gitExec(["commit", "-m", message, "--author", author], cwd);
}

export async function push(branchName: string, cwd: string): Promise<void> {
  await gitExec(["push", "origin", branchName], cwd);
}

export async function gitReset(cwd: string): Promise<void> {
  await gitExec(["reset", "--hard"], cwd);
  await gitExec(["clean", "-fd"], cwd);
}

export async function branchExists(
  branchName: string,
  cwd: string,
): Promise<boolean> {
  // Check local branch
  try {
    await gitExec(["rev-parse", "--verify", branchName], cwd);
    return true;
  } catch {
    // Not a local branch — check remote
  }
  // Use ls-remote for reliable remote branch detection (works in fresh clones)
  try {
    const output = await gitExec(
      ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`],
      cwd,
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
}
