import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * File I/O utilities for reading/writing knowledge base files.
 * All functions are async and operate on the local filesystem.
 */

/** Read a text file as UTF-8. */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/** Write a text file as UTF-8, creating parent directories as needed. */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/** Ensure a directory exists (creates recursively if needed). */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** Check if a file or directory exists. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Recursively list all markdown files in a directory. Returns absolute paths. */
export async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results;
}
