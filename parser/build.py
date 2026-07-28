#!/usr/bin/env python3
"""
P4 Phase 4b — PyInstaller 打包脚本

将 parse.py 打包为 Tauri sidecar 可执行文件。
Tauri 要求 sidecar 命名格式: <name>-<target-triple>[.exe]

用法:
    python build.py

输出:
    dist/parser/ 目录下生成可执行文件
    然后复制到 frontend/src-tauri/binaries/ 并按 target triple 重命名
"""

import os
import sys
import platform
import shutil
import subprocess
from pathlib import Path

# Tauri target triple 映射
TARGET_TRIPLES = {
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Windows", "x86"): "i686-pc-windows-msvc",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Darwin", "arm64"): "aarch64-apple-darwin",
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
}

def get_target_triple() -> str:
    """获取当前平台的 target triple"""
    system = platform.system()
    machine = platform.machine()
    key = (system, machine)
    if key not in TARGET_TRIPLES:
        raise RuntimeError(f"不支持的平台: {system}/{machine}")
    return TARGET_TRIPLES[key]

def main():
    parser_dir = Path(__file__).parent
    dist_dir = parser_dir / "dist"
    tauri_binaries = parser_dir.parent / "frontend" / "src-tauri" / "binaries"

    target_triple = get_target_triple()
    is_windows = platform.system() == "Windows"
    exe_suffix = ".exe" if is_windows else ""

    print(f"目标平台: {target_triple}")
    print(f"解析器目录: {parser_dir}")

    # 1. 运行 PyInstaller
    print("\n[1/3] 运行 PyInstaller...")
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "parser",
        "--clean",
        "--noconfirm",
        "--distpath", str(dist_dir),
        "--workpath", str(parser_dir / "build"),
        "--specpath", str(parser_dir / "build"),
        str(parser_dir / "parse.py"),
    ]
    print(f"  命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(parser_dir))
    if result.returncode != 0:
        print("PyInstaller 打包失败！")
        sys.exit(1)

    # 2. 复制到 Tauri binaries 目录并重命名
    print("\n[2/3] 复制到 Tauri binaries 目录...")
    tauri_binaries.mkdir(parents=True, exist_ok=True)

    src = dist_dir / f"parser{exe_suffix}"
    dst = tauri_binaries / f"parser-{target_triple}{exe_suffix}"
    shutil.copy2(src, dst)
    print(f"  {src} → {dst}")

    # 3. 验证
    print("\n[3/3] 验证 sidecar...")
    test_result = subprocess.run(
        [str(dst), "--help"],
        capture_output=True,
        text=True,
    )
    if test_result.returncode == 0 or "usage" in test_result.stdout.lower():
        print("  ✅ Sidecar 验证通过")
    else:
        print(f"  ⚠️ Sidecar 验证异常 (exit={test_result.returncode})")
        print(f"  stdout: {test_result.stdout[:200]}")
        print(f"  stderr: {test_result.stderr[:200]}")

    print(f"\n✅ 打包完成: {dst}")
    print(f"\n下一步: 在 tauri.conf.json 的 bundle.externalBin 中添加:")
    print(f'  "externalBin": ["binaries/parser"]')

if __name__ == "__main__":
    main()
