# P4 Phase 4b — Python 文件解析管道

> Tauri sidecar，将 PDF/DOCX/XLSX 文件解析为 markdown，供 staging 工作流使用。

## 架构

```text
用户拖拽文件 → Tauri (Rust) → 调用 parser sidecar → 返回 markdown JSON
                                                         ↓
                                            Tauri 写入 wiki/<domain>/ (status: staging)
                                                         ↓
                                            FileList 显示 → 用户确认 → kb_confirm_staging
```

## 支持格式

| 格式 | 库 | 能力 |
| --- | --- | --- |
| PDF | pymupdf (fitz) | 文本提取 + 表格检测 + 元数据 |
| DOCX | python-docx | 段落 + 标题层级 + 表格 → markdown |
| XLSX | openpyxl | 多工作表 → markdown 表格 |
| MD | 透传 | 直接透传 + 标题提取 |

## 开发

```bash
# 安装依赖（推荐 Python 3.12+）
pip install -r requirements.txt

# 本地测试
python parse.py test.pdf
python parse.py test.docx
python parse.py test.xlsx

# 输出 JSON 格式
{
    "success": true,
    "format": "pdf",
    "markdown": "...",
    "title": "文档标题",
    "metadata": { "pages": 10 }
}
```

## 运行模式

**Dev 模式（默认）**：Tauri 通过 `tauri-plugin-shell` 调用 `python parser/parse.py <file>`。
要求宿主机安装 Python 3.12+ 与 `pip install -r parser/requirements.txt`。
`KbConfig.python_path` 默认为 `"python"`，可通过 `KB_ROOT` 等环境变量覆盖。

**Production 模式（可选）**：用 PyInstaller 把 `parse.py` 打包为单文件可执行，
作为 Tauri sidecar 二进制分发。详见下方「打包」。

## 打包（可选，仅 production 分发需要）

```bash
# 用 PyInstaller 打包为 Tauri sidecar
python build.py

# 输出到 frontend/src-tauri/binaries/parser-<target-triple>[.exe]
# 然后在 tauri.conf.json 中取消注释 externalBin：
#   "externalBin": ["binaries/parser"]
# 并把 KbConfig.python_path 改为 sidecar 路径。
```

> **Note**: pymupdf 的 native 依赖（PyMuPDFb）体积较大，PyInstaller 首次打包
> 可能需要 10+ 分钟。dev 模式直接用 `python` 即可，无需打包。

## Tauri 集成

`tauri.conf.json` 添加：

```json
{
    "bundle": {
        "externalBin": ["binaries/parser"]
    }
}
```

Rust 调用：

```rust
use tauri_plugin_shell::ShellExt;

let output = app.shell()
    .sidecar("parser")?
    .args(["--", file_path])
    .output()
    .await?;
```

## License 凭证

| 库 | License |
| --- | --- |
| pymupdf | AGPL-3.0（非商业免费） |
| python-docx | MIT |
| openpyxl | MIT |
| PyInstaller | GPL-2.0（bootloader 例外） |

> **注意**：pymupdf 的 AGPL-3.0 要求衍生项目也开源。本项目是开源仓库，符合要求。
> 如需商业闭源分发，需购买商业 License 或改用 pdfplumber（BSD）。
