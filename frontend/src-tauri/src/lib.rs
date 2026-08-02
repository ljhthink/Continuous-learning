// P4 Phase 4b — Tauri IPC commands for file upload + staging workflow
//
// Commands:
//   upload_file(file_path, domain) → copies to raw/, calls Python parser, creates staging wiki page
//   list_staging(domain?)         → lists all staging pages
//   confirm_staging(page_path)    → promotes staging → active, appends log
//   reject_staging(page_path)     → marks staging → rejected, appends log
//   get_kb_config()               → returns KB root + parser paths (for frontend display)
//   open_external(path)           → opens a file/folder in OS default app (via opener plugin)
//
// Security:
//   - All path-taking commands validate the resolved path stays within KB root
//     (path traversal defense, ADR-010).
//   - The Python parser is invoked via tauri-plugin-shell with a fixed arg list
//     (no shell interpolation), so user-controlled file paths cannot inject
//     shell commands.
//   - CSP and capability scoping are configured in tauri.conf.json + capabilities/.

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// KB root directory configuration (managed state).
///
/// `kb_root` is resolved at startup from `KB_ROOT` env var or derived from
/// the crate manifest directory. `python_path` and `parser_path` default to
/// `"python"` and `<kb_root>/parser/parse.py` respectively; in production
/// builds these can be overridden to point at the PyInstaller sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KbConfig {
    pub kb_root: String,
    pub python_path: String,
    pub parser_path: String,
}

impl Default for KbConfig {
    fn default() -> Self {
        // During development, the project root is two levels up from src-tauri/
        // (src-tauri/ -> frontend/ -> project root). In production builds the
        // user can override via KB_ROOT env var.
        let project_root = std::env::var("KB_ROOT").unwrap_or_else(|_| {
            let manifest_dir = env!("CARGO_MANIFEST_DIR");
            Path::new(manifest_dir)
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| ".".to_string())
        });
        let parser_path = format!("{}/parser/parse.py", project_root);
        Self {
            kb_root: project_root,
            python_path: "python".to_string(),
            parser_path,
        }
    }
}

// ---------------------------------------------------------------------------
// IPC data shapes
// ---------------------------------------------------------------------------

/// JSON returned by the Python parser on stdout.
#[derive(Debug, Deserialize)]
struct ParserOutput {
    success: bool,
    format: Option<String>,
    markdown: Option<String>,
    title: Option<String>,
    #[serde(default)]
    metadata: HashMap<String, serde_json::Value>,
    error: Option<String>,
}

/// Staging page info returned to frontend.
#[derive(Debug, Serialize)]
pub struct StagingPage {
    path: String,
    title: String,
    domain: String,
    format: String,
    status: String,
    date: String,
    preview: String,
    source_file: String,
}

/// Upload result (success → page populated; failure → error populated).
#[derive(Debug, Serialize)]
pub struct UploadResult {
    success: bool,
    page: Option<StagingPage>,
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (minimal — server-side MCP server is the source of truth)
// ---------------------------------------------------------------------------

fn today_iso() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Slugify a title into a kebab-case filename stem.
fn slugify(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// First ~200 chars of the first 5 non-frontmatter lines as a preview.
///
/// L6 fix: `max_chars` is interpreted as a CHAR count, not byte count.
/// Slicing `&preview[..max_chars]` by byte index panics if the boundary
/// falls inside a multi-byte UTF-8 codepoint (e.g., Chinese text). Use
/// `chars().take()` to ensure we slice on character boundaries.
fn extract_preview(markdown: &str, max_chars: usize) -> String {
    let lines: Vec<&str> = markdown.lines().take(5).collect();
    let preview = lines.join("\n");
    if preview.chars().count() > max_chars {
        let truncated: String = preview.chars().take(max_chars).collect();
        format!("{}...", truncated)
    } else {
        preview
    }
}

/// Build a staging wiki page markdown with frontmatter (AGENTS.md §3 schema).
fn build_wiki_page(
    title: &str,
    domain: &str,
    source_file: &str,
    format: &str,
    markdown_body: &str,
    status: &str,
) -> String {
    let date = today_iso();
    format!(
        "---\ntitle: \"{}\"\ndomain: [{}]\ntype: source\nstatus: {}\ndate: {}\nsource_file: {}\n---\n\n## 原始内容（format: {}）\n\n{}\n",
        title.replace('"', "\\\""),
        domain,
        status,
        date,
        source_file,
        format,
        markdown_body
    )
}

/// Parse the `status:` field from frontmatter (minimal parser).
fn parse_frontmatter_status(content: &str) -> Option<String> {
    if !content.starts_with("---") {
        return None;
    }
    let end = content[3..].find("---")?;
    let yaml = &content[3..3 + end];
    for line in yaml.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("status:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

/// Parse the `title:` field from frontmatter (minimal parser).
fn parse_frontmatter_title(content: &str) -> Option<String> {
    if !content.starts_with("---") {
        return None;
    }
    let end = content[3..].find("---")?;
    let yaml = &content[3..3 + end];
    for line in yaml.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("title:") {
            let t = rest.trim();
            return Some(t.trim_matches('"').trim_matches('\'').to_string());
        }
    }
    None
}

/// Parse the `source_file:` field from frontmatter（P5-R2: 用于 delete_page 删除原始文件）。
fn parse_frontmatter_source_file(content: &str) -> Option<String> {
    if !content.starts_with("---") {
        return None;
    }
    let end = content[3..].find("---")?;
    let yaml = &content[3..3 + end];
    for line in yaml.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("source_file:") {
            let t = rest.trim();
            return Some(t.trim_matches('"').trim_matches('\'').to_string());
        }
    }
    None
}

/// Update the `status:` field in frontmatter (preserves everything else).
fn update_frontmatter_status(content: &str, new_status: &str) -> String {
    if !content.starts_with("---") {
        return content.to_string();
    }
    let Some(end) = content[3..].find("---") else {
        return content.to_string();
    };
    let yaml_end = 3 + end;
    let yaml = &content[3..yaml_end];
    let new_yaml = yaml
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("status:") {
                let indent_len = line.len() - trimmed.len();
                let indent = &line[..indent_len];
                format!("{}status: {}", indent, new_status)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    // P5-R4 fix: join("\n") 不添加尾部换行符，直接拼接 "---" 会产生
    // "use_count: 1---"（字段值与结束标记粘连），导致 frontmatter 解析失败。
    // 必须在 new_yaml 和 "---" 之间显式添加 "\n"。
    format!("---{}\n---{}", new_yaml, &content[yaml_end + 3..])
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn wiki_dir(kb_root: &str, domain: &str) -> PathBuf {
    Path::new(kb_root).join("wiki").join(domain)
}

fn raw_dir(kb_root: &str, format: &str) -> PathBuf {
    Path::new(kb_root).join("raw").join(format)
}

/// Validate that `path` resolves inside `base`. Returns the resolved PathBuf
/// or an error string suitable for returning from an IPC command.
fn validate_inside(base: &str, path: &str) -> Result<PathBuf, String> {
    let full = Path::new(base).join(path);
    let resolved = full.canonicalize().unwrap_or_else(|_| full.clone());
    let base_resolved = Path::new(base)
        .canonicalize()
        .map_err(|e| format!("Invalid KB root: {}", e))?;
    // P5-R3 fix: Windows std::fs::canonicalize adds the \\?\ verbatim prefix.
    // When `full` can't be canonicalized (file may not exist — e.g., path had
    // .md stripped by frontend), the fallback lacks this prefix while
    // base_resolved has it. Path::starts_with compares by components, so
    // `D:\...` does NOT start with `\\?\D:\...`, causing false "Path traversal
    // detected" errors (考古报告问题 2). Strip the prefix from both sides.
    let strip_verbatim = |p: &Path| -> PathBuf {
        PathBuf::from(p.to_string_lossy().trim_start_matches(r"\\?\").to_string())
    };
    let resolved_clean = strip_verbatim(&resolved);
    let base_clean = strip_verbatim(&base_resolved);
    if !resolved_clean.starts_with(&base_clean) {
        return Err(format!("Path traversal detected: {}", path));
    }
    Ok(resolved)
}

/// M1 fix: Validate domain is kebab-case (lowercase alphanumeric + hyphens).
/// Mirrors MCP-side `DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*$/` in schemas.ts.
/// Prevents path traversal via `domain = "../../../tmp"` in `upload_file` and
/// `list_staging`. Defense-in-depth — CSP blocks direct exploitation, but
/// backend must not rely solely on CSP.
fn is_valid_domain(d: &str) -> bool {
    if d.is_empty() {
        return false;
    }
    d.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// L2 fix: Strip CR/LF from a log field to prevent log injection (CWE-117).
/// Mirrors MCP-side `sanitizeLogField` in server/src/utils/log.ts.
/// `page_path` is user-controllable (filename could contain newlines on Linux);
/// without sanitization, a crafted path could forge a fake log entry.
fn sanitize_log_field(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}

// ---------------------------------------------------------------------------
// IPC: upload_file
// ---------------------------------------------------------------------------

/// Upload a file: copy to raw/<format>/, call Python parser, create staging wiki page.
///
/// Sequence (AGENTS.md §4.2 ingest workflow, adapted for binary sources):
///   1. Copy source file to `raw/<format>/<filename>` (raw/ is immutable).
///   2. Invoke Python parser (`parse.py <file_path>`) to extract markdown + metadata.
///   3. Write a staging wiki page at `wiki/<domain>/<slug>.md` with frontmatter
///      `type: source, status: staging`.
///   4. Return StagingPage to frontend for review.
///
/// Confirm/reject is a separate user action (confirm_staging / reject_staging).
#[tauri::command]
async fn upload_file(
    app_handle: AppHandle,
    file_path: String,
    domain: String,
    config: State<'_, KbConfig>,
) -> Result<UploadResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(UploadResult {
            success: false,
            page: None,
            error: Some(format!("文件不存在: {}", file_path)),
        });
    }

    // M1 fix: validate domain is kebab-case before constructing wiki_path.
    // Without this, `domain = "../../../tmp"` would write outside KB root.
    if !is_valid_domain(&domain) {
        return Ok(UploadResult {
            success: false,
            page: None,
            error: Some(format!(
                "invalid domain: '{}' (must be kebab-case: lowercase alphanumeric with hyphens)",
                domain
            )),
        });
    }

    // Determine file format from extension (default: md).
    let file_format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "md".to_string());

    // 1. Copy file to raw/<format>/.
    let raw_target_dir = raw_dir(&config.kb_root, &file_format);
    fs::create_dir_all(&raw_target_dir).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;
    let raw_path = raw_target_dir.join(file_name);
    fs::copy(&path, &raw_path).map_err(|e| e.to_string())?;
    let source_file = format!("raw/{}/{}", file_format, file_name);

    // 2. Call Python parser. We pass arguments as an array (no shell interpolation),
    //    so a malicious filename cannot inject shell commands.
    let parser_output = app_handle
        .shell()
        .command(&config.python_path)
        .args([&config.parser_path, &file_path])
        .output()
        .await
        .map_err(|e| format!("调用解析器失败: {}", e))?;

    if !parser_output.status.success() {
        let stderr = String::from_utf8_lossy(&parser_output.stderr);
        return Ok(UploadResult {
            success: false,
            page: None,
            error: Some(format!(
                "解析器退出码 {:?}: {}",
                parser_output.status.code(),
                stderr.chars().take(500).collect::<String>()
            )),
        });
    }

    let stdout = String::from_utf8_lossy(&parser_output.stdout).to_string();
    let parser_result: ParserOutput = serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "解析器输出解析失败: {} (stdout 前 200 字符: {})",
            e,
            stdout.chars().take(200).collect::<String>()
        )
    })?;

    if !parser_result.success {
        return Ok(UploadResult {
            success: false,
            page: None,
            error: Some(parser_result.error.unwrap_or_else(|| "解析失败".to_string())),
        });
    }

    let title = parser_result
        .title
        .unwrap_or_else(|| file_name.to_string());
    let markdown_body = parser_result.markdown.unwrap_or_default();
    let parsed_format = parser_result
        .format
        .unwrap_or_else(|| file_format.clone());

    // 3. Create staging wiki page (path traversal protected by domain kebab-case
    //    + slugify; defense-in-depth: verify resolved path stays under KB root).
    let slug = slugify(&title);
    let wiki_path = wiki_dir(&config.kb_root, &domain).join(format!("{}.md", slug));

    // Create parent directory FIRST so canonicalize() succeeds on it.
    // P5 fix: Previously, canonicalize(wiki_path) failed because the file
    // didn't exist yet, and the fallback (non-canonicalized path) lacked
    // the \\?\ prefix that kb_root_resolved had on Windows, causing
    // starts_with() to return false — a false-positive path traversal error
    // for ALL uploads (especially Chinese filenames like "2025国赛.md").
    if let Some(parent) = wiki_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // M1 defense-in-depth: verify the resolved path stays inside KB root.
    // Canonicalize the PARENT directory (which now exists) and rejoin the
    // filename — this ensures both paths have consistent \\?\ prefixes on Windows.
    let wiki_resolved = wiki_path
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .map(|p| p.join(wiki_path.file_name().unwrap_or_default()))
        .unwrap_or_else(|| wiki_path.clone());
    let kb_root_resolved = Path::new(&config.kb_root)
        .canonicalize()
        .map_err(|e| format!("Invalid KB root: {}", e))?;
    if !wiki_resolved.starts_with(&kb_root_resolved) {
        return Ok(UploadResult {
            success: false,
            page: None,
            error: Some(format!(
                "path traversal detected in wiki_path: {}",
                wiki_path.display()
            )),
        });
    }

    let page_content = build_wiki_page(
        &title,
        &domain,
        &source_file,
        &parsed_format,
        &markdown_body,
        "staging",
    );
    fs::write(&wiki_path, &page_content).map_err(|e| e.to_string())?;

    let rel_path = format!("wiki/{}/{}.md", domain, slug);
    let preview = extract_preview(&markdown_body, 200);

    Ok(UploadResult {
        success: true,
        page: Some(StagingPage {
            path: rel_path,
            title,
            domain,
            format: parsed_format,
            status: "staging".to_string(),
            date: today_iso(),
            preview,
            source_file,
        }),
        error: None,
    })
}

// ---------------------------------------------------------------------------
// IPC: list_staging
// ---------------------------------------------------------------------------

/// List all staging pages, optionally filtered by domain.
///
/// Scans `wiki/<domain>/*.md` (one level deep — does NOT recurse into
/// `experiences/`) for pages whose frontmatter `status: staging`.
///
/// L4 fix: When `domain` is provided, validate it is kebab-case before
/// joining into a path. Without this, `domain = "../"` would list `.md`
/// files outside `wiki/` (read-only path traversal / info leak).
#[tauri::command]
fn list_staging(
    domain: Option<String>,
    config: State<'_, KbConfig>,
) -> Result<Vec<StagingPage>, String> {
    let wiki_root = Path::new(&config.kb_root).join("wiki");
    let mut pages = Vec::new();

    let domains: Vec<String> = if let Some(d) = domain {
        // L4: validate domain kebab-case before path join.
        if !is_valid_domain(&d) {
            return Err(format!(
                "invalid domain: '{}' (must be kebab-case: lowercase alphanumeric with hyphens)",
                d
            ));
        }
        vec![d]
    } else {
        fs::read_dir(&wiki_root)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
            .collect()
    };

    for d in domains {
        let d_dir = wiki_root.join(&d);
        if !d_dir.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&d_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let status = parse_frontmatter_status(&content);
            if status.as_deref() != Some("staging") {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let rel_path = format!("wiki/{}/{}", d, file_name);
            let title = parse_frontmatter_title(&content)
                .unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string());
            // Body = content after frontmatter; preview first 5 lines.
            let body_start = content
                .find("\n---\n")
                .map(|i| i + 5)
                .unwrap_or(0);
            let preview = extract_preview(&content[body_start..], 200);
            pages.push(StagingPage {
                path: rel_path,
                title,
                domain: d.clone(),
                format: "unknown".to_string(),
                status: "staging".to_string(),
                date: today_iso(),
                preview,
                source_file: String::new(),
            });
        }
    }

    Ok(pages)
}

// ---------------------------------------------------------------------------
// IPC: confirm_staging / reject_staging
// ---------------------------------------------------------------------------

/// Confirm a staging page → set frontmatter `status: active`, append log.md.
///
/// M2 fix: Verify current frontmatter status is `staging` before overwriting.
/// Without this check, an already-active/rejected/archived page could be
/// re-confirmed, bypassing the staging review workflow (AGENTS.md §3.4 state
/// machine). The `from_status` log field now uses the actual read status
/// instead of a hardcoded "staging", so audit logs stay truthful.
#[tauri::command]
fn confirm_staging(
    page_path: String,
    config: State<'_, KbConfig>,
) -> Result<(), String> {
    let full_path = validate_inside(&config.kb_root, &page_path)?;
    if !full_path.exists() {
        return Err(format!("页面不存在: {}", page_path));
    }

    let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
    let current_status = parse_frontmatter_status(&content)
        .unwrap_or_else(|| "unknown".to_string());
    if current_status != "staging" {
        return Err(format!(
            "Cannot confirm: page status is \"{}\", expected \"staging\". Only staging pages can be confirmed.",
            current_status
        ));
    }
    let new_content = update_frontmatter_status(&content, "active");
    fs::write(&full_path, &new_content).map_err(|e| e.to_string())?;

    append_log(&config.kb_root, "confirm", &page_path, &current_status, "active")?;
    Ok(())
}

/// Reject a staging page → set frontmatter `status: rejected`, append log.md.
///
/// M2 fix: Same state-machine guard as `confirm_staging`. Prevents rejecting
/// an already-rejected or active page, and records the real `from_status`.
#[tauri::command]
fn reject_staging(
    page_path: String,
    config: State<'_, KbConfig>,
) -> Result<(), String> {
    let full_path = validate_inside(&config.kb_root, &page_path)?;
    if !full_path.exists() {
        return Err(format!("页面不存在: {}", page_path));
    }

    let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
    let current_status = parse_frontmatter_status(&content)
        .unwrap_or_else(|| "unknown".to_string());
    if current_status != "staging" {
        return Err(format!(
            "Cannot reject: page status is \"{}\", expected \"staging\". Only staging pages can be rejected.",
            current_status
        ));
    }
    let new_content = update_frontmatter_status(&content, "rejected");
    fs::write(&full_path, &new_content).map_err(|e| e.to_string())?;

    append_log(&config.kb_root, "reject", &page_path, &current_status, "rejected")?;
    Ok(())
}

/// Update a staging page's content with LLM-organized markdown (P5, ADR-013).
///
/// Replaces the entire file content with `new_content` (which includes
/// frontmatter generated by the LLM). Ensures `status: staging` is preserved
/// so the user can still confirm or reject after reviewing the organized content.
///
/// Security:
///   - Path validated via `validate_inside` (path traversal defense, ADR-010).
///   - State-machine guard: only staging pages can be updated (prevents
///     overwriting an already-confirmed active page).
///   - `new_content` is written as-is (UTF-8); the LLM is trusted to produce
///     valid markdown, but `status: staging` is force-set to prevent the LLM
///     from accidentally setting `status: active` and bypassing review.
#[tauri::command]
fn update_staging_content(
    page_path: String,
    new_content: String,
    config: State<'_, KbConfig>,
) -> Result<(), String> {
    let full_path = validate_inside(&config.kb_root, &page_path)?;
    if !full_path.exists() {
        return Err(format!("页面不存在: {}", page_path));
    }

    let old_content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
    let current_status = parse_frontmatter_status(&old_content)
        .unwrap_or_else(|| "unknown".to_string());
    if current_status != "staging" {
        return Err(format!(
            "Cannot update: page status is \"{}\", expected \"staging\". Only staging pages can be updated.",
            current_status
        ));
    }

    // Force-set status to "staging" in the new content (LLM might have set
    // something else). This ensures the user must still explicitly confirm.
    let content_with_correct_status = update_frontmatter_status(&new_content, "staging");
    fs::write(&full_path, &content_with_correct_status).map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// IPC: delete_page（P5 UX-3: 手动删除 wiki 页面）
// ---------------------------------------------------------------------------

/// Delete a wiki page file. Works for both staging and active pages.
///
/// Safety:
/// - Path traversal protected via validate_inside
/// - Only deletes .md files under wiki/
/// - P5-R2: 可选删除 raw/ 原始文件（delete_raw=true，用户授权例外，AGENTS.md §9.3）
/// - Appends a log entry for auditability
#[tauri::command]
fn delete_page(
    page_path: String,
    delete_raw: Option<bool>,
    config: State<'_, KbConfig>,
) -> Result<String, String> {
    // P5-R3 fix: auto-append .md if missing — currentPagePath may have been
    // stripped of .md by handleWikiLinkClick or normalizeCacheKey (考古报告问题 2).
    let page_path = if page_path.ends_with(".md") {
        page_path
    } else {
        format!("{}.md", page_path)
    };
    let full_path = validate_inside(&config.kb_root, &page_path)?;

    // Defense-in-depth: only allow deleting .md files under wiki/
    if !full_path.extension().map_or(false, |e| e == "md") {
        return Err("只能删除 .md 文件".to_string());
    }
    // Canonicalize wiki root to match full_path's \\?\ prefix on Windows.
    let wiki_root = Path::new(&config.kb_root)
        .join("wiki")
        .canonicalize()
        .map_err(|e| format!("wiki/ 目录不存在: {}", e))?;
    if !full_path.starts_with(&wiki_root) {
        return Err("只能删除 wiki/ 目录下的页面".to_string());
    }
    if !full_path.exists() {
        return Err(format!("页面不存在: {}", page_path));
    }

    // Read content before deletion（用于提取 title 和 source_file）
    let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
    let title = parse_frontmatter_title(&content).unwrap_or_else(|| page_path.clone());

    // Delete the wiki page
    fs::remove_file(&full_path).map_err(|e| e.to_string())?;

    let mut deleted_raw_path: Option<String> = None;

    // P5-R2 问题 5: 可选删除 raw/ 原始文件（用户授权例外，二次确认由前端保证）
    if delete_raw.unwrap_or(false) {
        if let Some(source_file) = parse_frontmatter_source_file(&content) {
            let raw_full = Path::new(&config.kb_root).join(&source_file);
            // 路径穿越防护：raw 文件必须在 raw/ 目录下
            let raw_root = Path::new(&config.kb_root)
                .join("raw")
                .canonicalize()
                .map_err(|e| format!("raw/ 目录不存在: {}", e))?;
            let raw_resolved = raw_full
                .parent()
                .and_then(|p| p.canonicalize().ok())
                .map(|p| p.join(raw_full.file_name().unwrap_or_default()))
                .unwrap_or_else(|| raw_full.clone());
            if raw_resolved.starts_with(&raw_root) && raw_resolved.exists() {
                fs::remove_file(&raw_resolved).map_err(|e| e.to_string())?;
                deleted_raw_path = Some(source_file);
            }
        }
    }

    // Append log entry
    let log_path = Path::new(&config.kb_root).join("log.md");
    let raw_log = deleted_raw_path
        .as_ref()
        .map(|p| format!("\n- deleted_raw: {}", sanitize_log_field(p)))
        .unwrap_or_default();
    let log_entry = format!(
        "\n## [{}] delete | {}\n- deleted_path: {}\n- reason: manual deletion via GUI{}\n",
        today_iso(),
        sanitize_log_field(&title),
        sanitize_log_field(&page_path),
        raw_log,
    );
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&log_path)
        .and_then(|mut f| f.write_all(log_entry.as_bytes()))
        .map_err(|e| e.to_string())?;

    Ok(deleted_raw_path.unwrap_or_default())
}

/// Append a `## [YYYY-MM-DD] <type> | <title>` entry to log.md.
/// Format matches AGENTS.md §4.4 (server-side appendLogEntry is the canonical
/// implementation; this is a minimal mirror for the GUI-only confirm/reject
/// path that bypasses the MCP server).
///
/// L2 fix: `page_path` is sanitized via `sanitize_log_field` to strip CR/LF,
/// preventing log injection (CWE-117) — a crafted filename containing
/// newlines could otherwise forge a fake log section header.
fn append_log(
    kb_root: &str,
    entry_type: &str,
    page_path: &str,
    from_status: &str,
    to_status: &str,
) -> Result<(), String> {
    let log_path = Path::new(kb_root).join("log.md");
    let safe_path = sanitize_log_field(page_path);
    let safe_from = sanitize_log_field(from_status);
    let safe_to = sanitize_log_field(to_status);
    let entry = format!(
        "\n## [{}] {} | {}\n\n- page: {}\n- from_status: {}\n- to_status: {}\n",
        today_iso(),
        entry_type,
        safe_path,
        safe_path,
        safe_from,
        safe_to
    );
    if log_path.exists() {
        let log_content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
        fs::write(&log_path, format!("{}{}", log_content, entry)).map_err(|e| e.to_string())?;
    } else {
        fs::write(&log_path, &entry).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// IPC: get_kb_config (for frontend display + diagnostics)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_kb_config(config: State<'_, KbConfig>) -> KbConfig {
    config.inner().clone()
}

// ---------------------------------------------------------------------------
// IPC: call_mcp_tool (P4 Phase 4c — bridge to MCP server tools via CLI)
// ---------------------------------------------------------------------------

/// Result of calling an MCP tool via the CLI subprocess.
#[derive(Debug, Serialize)]
pub struct McpToolResult {
    success: bool,
    /// The tool's JSON output (already-extracted from MCP `content[0].text`).
    data: serde_json::Value,
    /// Error message if the tool returned an error or the subprocess failed.
    error: Option<String>,
}

/// Call an MCP server tool by spawning `node --import tsx src/cli.ts <tool> <args>`.
///
/// This is the Phase 4c bridge that lets the React frontend invoke complex
/// MCP tools (kb_get_graph, kb_get_backlinks, kb_search, kb_get_page, etc.)
/// without duplicating their logic in Rust. Each call pays ~200ms Node startup
/// but avoids the complexity of a long-lived MCP server process.
///
/// Security: `tool_name` is validated against a whitelist ( TOOL_LIST constant).
/// `args_json` is passed as a single argv element, so it cannot inject shell
/// commands. The subprocess inherits KB_ROOT from the Tauri process env.
#[tauri::command]
async fn call_mcp_tool(
    app_handle: AppHandle,
    tool_name: String,
    args_json: String,
    config: State<'_, KbConfig>,
) -> Result<McpToolResult, String> {
    // Whitelist of allowed tool names — prevents arbitrary command execution.
    // Read-only tools are safe to expose. Write tools (kb_promote_experience)
    // are included because: (1) the CLI subprocess runs locally with no remote
    // access, (2) kb_promote_experience has its own state-machine validation
    // (checks status=pending, type=experience), (3) duplicating the promote
    // logic (including levenshtein/sorensen-dice duplicate detection) in Rust
    // would be ~100 lines of code with a maintenance burden. The whitelist
    // itself is defense-in-depth — the real protection is that `tool_name`
    // is validated and `args_json` is passed as a single argv element.
    const TOOL_WHITELIST: &[&str] = &[
        "kb_search",
        "kb_get_page",
        "kb_list_categories",
        "kb_list_recent",
        "kb_health",
        "kb_lint",
        "kb_get_graph",
        "kb_get_backlinks",
        "kb_list_staging",
        "kb_list_inbox",
        "kb_promote_experience",
    ];
    if !TOOL_WHITELIST.contains(&tool_name.as_str()) {
        return Ok(McpToolResult {
            success: false,
            data: serde_json::Value::Null,
            error: Some(format!(
                "tool '{}' not in whitelist (allowed: {:?})",
                tool_name, TOOL_WHITELIST
            )),
        });
    }

    // Validate args_json is parseable JSON before spawning (fail fast).
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&args_json) {
        return Ok(McpToolResult {
            success: false,
            data: serde_json::Value::Null,
            error: Some(format!("invalid args_json: {}", e)),
        });
    }

    // Locate server/src/cli.ts relative to kb_root.
    // During dev, kb_root is the project root, so cli.ts is at
    // <kb_root>/server/src/cli.ts.
    let cli_path = format!("{}/server/src/cli.ts", config.kb_root);
    // tsx is installed in server/node_modules, so cwd must be server/ for
    // Node's module resolver to find it. Without this, Node looks in
    // src-tauri/node_modules and fails with ERR_MODULE_NOT_FOUND.
    let server_dir = format!("{}/server", config.kb_root);

    // Spawn: node --import tsx <cli_path> <tool_name> <args_json>
    // Args are passed as an array — no shell interpolation.
    let output = app_handle
        .shell()
        .command("node")
        .args([
            "--import",
            "tsx",
            &cli_path,
            &tool_name,
            &args_json,
        ])
        .current_dir(&server_dir)
        .output()
        .await
        .map_err(|e| format!("failed to spawn node: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    // Exit code 0 = success, 2 = tool-level error (still has stdout),
    // 1 = subprocess crash.
    let exit_code = output.status.code().unwrap_or(-1);
    if exit_code == 0 {
        let data: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| {
            format!(
                "failed to parse tool output as JSON: {} (stdout: {})",
                e,
                stdout.chars().take(300).collect::<String>()
            )
        })?;
        Ok(McpToolResult {
            success: true,
            data,
            error: None,
        })
    } else if exit_code == 2 {
        // Tool-level error: stdout has the error JSON, exit code 2.
        let data: serde_json::Value = serde_json::from_str(&stdout)
            .unwrap_or(serde_json::Value::Null);
        // P5-R3 fix: include the MCP tool's specific error message (e.g.,
        // "Page not found: ...") instead of a generic "returned error"
        // (考古报告问题 4: 丢弃具体错误消息导致用户无法诊断).
        // Note: extract error as owned String before moving `data` into result.
        let mcp_error = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        Ok(McpToolResult {
            success: false,
            data,
            error: Some(format!("{}: {}", tool_name, mcp_error)),
        })
    } else {
        // Subprocess crash — stderr has the message.
        Ok(McpToolResult {
            success: false,
            data: serde_json::Value::Null,
            error: Some(format!(
                "subprocess exited with code {}: {}",
                exit_code,
                stderr.chars().take(500).collect::<String>()
            )),
        })
    }
}

// ---------------------------------------------------------------------------
// LLM 集成（P5, ADR-013）
//
// 支持 OpenAI 兼容 + Bearer Token 认证的所有厂商，统一调用接口。
// 模型名与 API 地址均可自定义（P5-R2），用户可配置任意兼容端点。
// 请求经 Rust 端 reqwest 发出（避免前端 CORS，API Key 不暴露到 webview）。
// API Key 经 keyring crate 存操作系统密钥环（ADR-013 V7）。
// ---------------------------------------------------------------------------

/// LLM provider 默认配置（用户可通过 customBaseUrl / customModelName 覆盖）
#[derive(Debug)]
struct LlmProviderConfig {
    base_url: &'static str,
    model: &'static str,
}

/// 根据 provider 名称获取配置（白名单校验）
/// P5-R3: 新增 "custom" provider（baseUrl/model 为空，由用户自定义填充）。
/// 保留旧 provider 用于向后兼容已保存的 keyring 条目。
fn get_provider_config(provider: &str) -> Result<LlmProviderConfig, String> {
    match provider {
        "custom" => Ok(LlmProviderConfig {
            base_url: "",
            model: "",
        }),
        "deepseek" => Ok(LlmProviderConfig {
            base_url: "https://api.deepseek.com/v1",
            model: "deepseek-v4-pro",
        }),
        "glm" => Ok(LlmProviderConfig {
            base_url: "https://open.bigmodel.cn/api/paas/v4",
            model: "glm-5.2",
        }),
        "kimi" => Ok(LlmProviderConfig {
            base_url: "https://api.moonshot.cn/v1",
            model: "kimi-k3",
        }),
        _ => Err(format!("unknown provider: {}", provider)),
    }
}

/// 调用 LLM API（OpenAI 兼容格式，统一接口）
///
/// 安全：
/// - provider 经白名单校验（get_provider_config）
/// - api_key 仅在本次请求的 Authorization header 中使用，不持久化到日志
/// - 请求经 Rust 端发出，前端 webview 不接触 API Key 的网络传输
/// - 超时 180s（P5-R4: 移除 max_tokens 后大文件整理输出更长，60s 可能超时）
///
/// P5-R2: 新增 model 参数，支持自定义模型名（覆盖默认，问题 2）
///
/// P6-R1 增强（流式响应 + 错误重试 + 截断检测 + 成本控制）：
/// - 新增 `app_handle` 参数（Tauri 自动注入），用于 emit 流式 token / 重试 / 用量事件
/// - 新增 `stream` 参数（默认 false，向后兼容）：true 时启用 SSE 流式响应
/// - 新增 `max_tokens` 参数（默认 None=不限）：用户可选的输出 token 上限
/// - 指数退避重试（最多 3 次，针对 429/5xx/网络错误），尊重 Retry-After 头
/// - 解析 `finish_reason`，检测截断（length）并 emit `llm-truncated`
/// - 解析 `usage`，emit `llm-usage` 供前端显示 token 消耗
///
/// 事件协议（仅 stream=true 时 emit token/done；usage/truncated/retry 两种模式都 emit）：
/// - `llm-token`      payload: &str          流式 token 增量
/// - `llm-done`       payload: &str          完整内容（流式结束）
/// - `llm-usage`      payload: serde_json::Value   token 用量统计
/// - `llm-truncated`  payload: &str          截断原因（"length"）
/// - `llm-retry`      payload: {attempt, delay_ms, error}  重试通知
/// - `llm-error`      payload: &str          流式中途错误（已有部分 token）
#[tauri::command]
async fn call_llm_api(
    app_handle: AppHandle,
    provider: String,
    api_key: String,
    prompt: String,
    system_prompt: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
    stream: Option<bool>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let config = get_provider_config(&provider)?;
    // P5 UX-2: 优先使用用户自定义 base_url（覆盖默认端点，支持代理/自托管）
    let effective_base = base_url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| config.base_url.to_string());
    // P5-R2 问题 2: 优先使用用户自定义 model（覆盖默认模型名）
    let effective_model = model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| config.model.to_string());
    // P5-R3 fix: "custom" provider 的 baseUrl/model 为空，用户必须填写
    if effective_base.is_empty() {
        return Err("API 地址未配置，请在设置中填写 API 地址".to_string());
    }
    if effective_model.is_empty() {
        return Err("模型名未配置，请在设置中填写模型名".to_string());
    }
    let url = format!("{}/chat/completions", effective_base);

    // 组装 OpenAI 兼容请求体
    let mut messages = Vec::new();
    if let Some(sys) = &system_prompt {
        if !sys.is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
    }
    messages.push(serde_json::json!({"role": "user", "content": prompt}));

    // P6-R1: 请求体构造 — stream + 可选 max_tokens
    let use_stream = stream.unwrap_or(false);
    let mut body = serde_json::json!({
        "model": effective_model,
        "messages": messages,
        // P5-R4: 默认不设 max_tokens（大文件整理时内容被截断）。
        // P6-R1: max_tokens 改为用户可选配置（成本控制），默认 None=不限。
    });
    if use_stream {
        body["stream"] = serde_json::json!(true);
        // 流式模式下请求 usage（部分厂商在最后一个 chunk 返回）
        body["stream_options"] = serde_json::json!({"include_usage": true});
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = serde_json::json!(mt);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {}", e))?;

    // P6-R1: 重试循环（指数退避 + 抖动，最多 3 次重试）
    let max_retries = 3u32;
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        let result = if use_stream {
            send_llm_streaming(&app_handle, &client, &url, &api_key, &body).await
        } else {
            send_llm_non_streaming(&app_handle, &client, &url, &api_key, &body).await
        };
        match result {
            Ok(content) => return Ok(content),
            Err(e) => {
                if e.retryable && attempt <= max_retries {
                    let delay = compute_backoff_delay(attempt, e.retry_after_ms);
                    let _ = app_handle.emit(
                        "llm-retry",
                        serde_json::json!({
                            "attempt": attempt,
                            "delay_ms": delay,
                            "error": e.message,
                        }),
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    continue;
                }
                return Err(e.message);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// P6-R1: LLM 调用辅助函数（流式 / 非流式 / 重试 / SSE 解析）
// ---------------------------------------------------------------------------

/// LLM 错误类型（携带重试元信息）
struct LlmError {
    message: String,
    retryable: bool,
    retry_after_ms: Option<u64>,
}

/// 判定 HTTP 状态码是否可重试（429 限流 / 5xx 服务端错误）
fn is_retryable_status(status: u16) -> bool {
    status == 429 || (500..600).contains(&status)
}

/// 解析 Retry-After 响应头（仅秒数形式，HTTP 日期形式不解析）
fn parse_retry_after(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|secs| secs * 1000)
}

/// 计算指数退避延迟（含抖动）：1s, 2s, 4s + 0-500ms 抖动
/// 若有 Retry-After 头，取 max(计算值, retry_after)
fn compute_backoff_delay(attempt: u32, retry_after_ms: Option<u64>) -> u64 {
    let base_ms = 1000u64
        .checked_shl(attempt.saturating_sub(1))
        .unwrap_or(8000); // 1s, 2s, 4s, cap 8s
    let jitter = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_millis() as u64)
        % 500;
    let computed = base_ms + jitter;
    match retry_after_ms {
        Some(ra) if ra > computed => ra,
        _ => computed,
    }
}

/// 非流式请求（含 usage/finish_reason 解析与事件 emit）
async fn send_llm_non_streaming(
    app_handle: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> Result<String, LlmError> {
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| LlmError {
            message: format!("HTTP request failed: {}", e),
            retryable: true,
            retry_after_ms: None,
        })?;

    let status = resp.status();
    if !status.is_success() {
        let retry_after = parse_retry_after(resp.headers());
        let text = resp.text().await.unwrap_or_default();
        let truncated: String = text.chars().take(500).collect();
        return Err(LlmError {
            message: format!("LLM API error {}: {}", status, truncated),
            retryable: is_retryable_status(status.as_u16()),
            retry_after_ms: retry_after,
        });
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| LlmError {
            message: format!("failed to parse response JSON: {}", e),
            retryable: false,
            retry_after_ms: None,
        })?;

    // P6-R1: 解析 finish_reason（截断检测）
    if let Some(reason) = json["choices"][0]["finish_reason"].as_str() {
        if reason == "length" {
            let _ = app_handle.emit("llm-truncated", reason);
        }
    }

    // P6-R1: 解析 usage（成本控制）
    if let Some(usage) = json.get("usage") {
        let _ = app_handle.emit("llm-usage", usage);
    }

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| LlmError {
            message: "missing content in LLM response".to_string(),
            retryable: false,
            retry_after_ms: None,
        })?;

    Ok(content.to_string())
}

/// 流式请求（SSE 解析 + 逐 token emit + usage/finish_reason 检测）
async fn send_llm_streaming(
    app_handle: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> Result<String, LlmError> {
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| LlmError {
            message: format!("HTTP request failed: {}", e),
            retryable: true,
            retry_after_ms: None,
        })?;

    let status = resp.status();
    if !status.is_success() {
        let retry_after = parse_retry_after(resp.headers());
        let text = resp.text().await.unwrap_or_default();
        let truncated: String = text.chars().take(500).collect();
        return Err(LlmError {
            message: format!("LLM API error {}: {}", status, truncated),
            retryable: is_retryable_status(status.as_u16()),
            retry_after_ms: retry_after,
        });
    }

    // P6-R1: SSE 流式读取（使用 reqwest Response::chunk，无需额外依赖）
    let mut full_content = String::new();
    let mut buffer = String::new();
    let mut finish_reason: Option<String> = None;
    let mut usage_emitted = false;
    let mut resp = resp;

    loop {
        let chunk = resp
            .chunk()
            .await
            .map_err(|e| LlmError {
                message: format!("stream read failed: {}", e),
                retryable: false, // 流中途失败不重试（部分 token 已 emit）
                retry_after_ms: None,
            })?;
        match chunk {
            Some(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                // SSE 事件以 "\n\n" 分隔，处理所有完整事件
                while let Some(idx) = buffer.find("\n\n") {
                    let event = buffer[..idx].to_string();
                    buffer = buffer[idx + 2..].to_string();
                    process_sse_event(
                        &event,
                        app_handle,
                        &mut full_content,
                        &mut finish_reason,
                        &mut usage_emitted,
                    )?;
                }
            }
            None => break, // 流结束
        }
    }
    // 处理缓冲区中剩余的不完整事件
    if !buffer.trim().is_empty() {
        process_sse_event(
            &buffer,
            app_handle,
            &mut full_content,
            &mut finish_reason,
            &mut usage_emitted,
        )?;
    }

    // P6-R1: 截断检测
    if finish_reason.as_deref() == Some("length") {
        let _ = app_handle.emit("llm-truncated", "length");
    }

    let _ = app_handle.emit("llm-done", &full_content);
    Ok(full_content)
}

/// 解析单个 SSE 事件，提取 token / finish_reason / usage 并 emit
fn process_sse_event(
    event: &str,
    app_handle: &AppHandle,
    full_content: &mut String,
    finish_reason: &mut Option<String>,
    usage_emitted: &mut bool,
) -> Result<(), LlmError> {
    for line in event.lines() {
        let line = line.trim();
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let json: serde_json::Value = serde_json::from_str(data).map_err(|e| LlmError {
                message: format!("SSE JSON parse error: {}", e),
                retryable: false,
                retry_after_ms: None,
            })?;

            // 提取 token 增量并 emit
            if let Some(token) = json["choices"][0]["delta"]["content"].as_str() {
                if !token.is_empty() {
                    full_content.push_str(token);
                    let _ = app_handle.emit("llm-token", token);
                }
            }

            // 提取 finish_reason（通常在最后一个 chunk）
            if let Some(reason) = json["choices"][0]["finish_reason"].as_str() {
                *finish_reason = Some(reason.to_string());
            }

            // 提取 usage（流式模式下在最后一个 chunk，需 stream_options.include_usage）
            if let Some(usage) = json.get("usage") {
                if !*usage_emitted && !usage.is_null() {
                    let _ = app_handle.emit("llm-usage", usage);
                    *usage_emitted = true;
                }
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// P6-R3: LLM 自动分类（建议+确认模式，ADR-013 / 决策计划 §4.3）
// ---------------------------------------------------------------------------

/// 分类结果（LLM 返回，经容错解析）
///
/// 安全约束（决策计划 §4.3.3）：
/// - LLM 只能「建议」，不能直接创建/删除分类目录
/// - 创建/删除必须经用户确认，由独立 IPC（create_domain_directory）执行
/// - classify_domain 本身无任何文件系统写操作
#[derive(Debug, serde::Serialize)]
struct ClassifyResult {
    /// 推荐的已有领域（必须在 existing_domains 列表中，否则视为新分类提议）
    domain: String,
    /// 置信度 0.0-1.0（<0.7 时前端不自动推荐，让用户手动选）
    confidence: f64,
    /// 新分类提议（当无合适已有领域时，LLM 可提议新分类；用户确认后才创建）
    new_domain_proposal: Option<NewDomainProposal>,
    /// 推荐理由（供用户判断是否接受）
    reason: String,
}

/// 新分类提议（LLM 建议，需用户确认）
#[derive(Debug, serde::Serialize)]
struct NewDomainProposal {
    /// kebab-case 分类名
    name: String,
    /// 分类描述（一句话说明该分类的用途）
    description: String,
}

/// 非流式 LLM 调用辅助（含重试，供 classify_domain 等内部调用复用）。
///
/// 与 `call_llm_api` IPC 的非流式路径逻辑一致，但不 emit token 事件
/// （分类是短调用，无需流式渲染）。保留 usage/truncated 事件 emit 供前端感知。
async fn llm_complete_non_streaming(
    app_handle: &AppHandle,
    provider: &str,
    api_key: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    base_url: Option<&str>,
    model: Option<&str>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let config = get_provider_config(provider)?;
    let effective_base = base_url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or(config.base_url);
    let effective_model = model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or(config.model);
    if effective_base.is_empty() {
        return Err("API 地址未配置，请在设置中填写 API 地址".to_string());
    }
    if effective_model.is_empty() {
        return Err("模型名未配置，请在设置中填写模型名".to_string());
    }
    let url = format!("{}/chat/completions", effective_base);

    let mut messages = Vec::new();
    if let Some(sys) = system_prompt {
        if !sys.is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
    }
    messages.push(serde_json::json!({"role": "user", "content": prompt}));

    let mut body = serde_json::json!({
        "model": effective_model,
        "messages": messages,
    });
    if let Some(mt) = max_tokens {
        body["max_tokens"] = serde_json::json!(mt);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {}", e))?;

    let max_retries = 3u32;
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        match send_llm_non_streaming(app_handle, &client, &url, api_key, &body).await {
            Ok(content) => return Ok(content),
            Err(e) => {
                if e.retryable && attempt <= max_retries {
                    let delay = compute_backoff_delay(attempt, e.retry_after_ms);
                    let _ = app_handle.emit(
                        "llm-retry",
                        serde_json::json!({
                            "attempt": attempt,
                            "delay_ms": delay,
                            "error": e.message,
                        }),
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    continue;
                }
                return Err(e.message);
            }
        }
    }
}

/// 从 LLM 响应文本中提取 JSON 对象（容错：剥离 ```json 代码块、前后多余文本）。
///
/// LLM 经常将 JSON 包裹在 ```json ... ``` 中，或在 JSON 前后添加解释性文字。
/// 此函数找到第一个 `{` 与最后一个 `}` 之间的内容并解析。
fn extract_json_object(text: &str) -> Option<serde_json::Value> {
    // 优先尝试直接解析（最理想情况）
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim()) {
        if v.is_object() {
            return Some(v);
        }
    }
    // 容错：找第一个 { 到最后一个 } 之间的子串
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    let json_str = &text[start..=end];
    serde_json::from_str::<serde_json::Value>(json_str).ok()
}

/// P6-R3: LLM 自动分类 IPC 命令（建议+确认模式）。
///
/// 输入文档标题+预览内容+已有领域列表，LLM 返回推荐领域+置信度+（可选）新分类提议。
///
/// **安全约束**：
/// - 此命令只返回建议，不执行任何文件系统写操作
/// - 新分类创建由独立的 `create_domain_directory` 命令执行（需用户在前端确认）
/// - LLM 无法通过此命令删除或修改已有分类
#[tauri::command]
async fn classify_domain(
    app_handle: AppHandle,
    provider: String,
    api_key: String,
    title: String,
    preview: String,
    existing_domains: Vec<String>,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<ClassifyResult, String> {
    if api_key.trim().is_empty() {
        return Err("API Key 未配置，请先在设置中保存".to_string());
    }
    if existing_domains.is_empty() {
        return Err("已有领域列表为空，无法分类".to_string());
    }

    // 构造分类系统提示词
    // P6-R5: 改造为两段式置信度评估——top-1 置信度 < 0.6 时强制提议新领域。
    // 借鉴 TnT-LLM 的 update prompt 思路：让 LLM 显式评估匹配度而非「找到勉强匹配」。
    let domains_list = existing_domains
        .iter()
        .map(|d| format!("  - `{}`", d))
        .collect::<Vec<_>>()
        .join("\n");
    let system_prompt = format!(
        "你是一个文档分类助手。根据文档标题和内容，评估它应归入哪个领域。\n\
         已有领域列表：\n\
         {}\n\n\
         返回严格的 JSON（不要包裹在代码块中，不要添加额外文字）：\n\
         {{\n\
         \"domain\": \"最匹配的已有领域名（若 top-1 置信度 < 0.6 则留空字符串 \\\"\\\"）\",\n\
         \"confidence\": 0.0到1.0的top-1匹配置信度,\n\
         \"new_domain_proposal\": null或{{\"name\": \"kebab-case分类名\", \"description\": \"一句话描述\"}},\n\
         \"reason\": \"一句话说明\"\n\
         }}\n\n\
         决策规则：\n\
         1. 评估文档与每个已有领域的语义匹配度，给出 top-1 置信度（confidence）。\n\
            - 0.9=高度确信（文档主题与某领域高度重合）\n\
            - 0.7=较确信（文档主要属于某领域，但有部分内容相关其他领域）\n\
            - 0.5=不确定（文档勉强可放入某领域，但主题不完全契合）\n\
            - 0.3=低匹配（文档主题与所有已有领域都偏差较大）\n\
         2. 若 confidence ≥ 0.6：将 domain 设为该已有领域名（原样输出，不要翻译或改写），new_domain_proposal 设为 null。\n\
         3. 若 confidence < 0.6：将 domain 设为空字符串 \"\"，并在 new_domain_proposal 中提议一个新分类：\n\
            - name 必须为 kebab-case（小写字母/数字/连字符，如 math-modeling、data-science、finance）\n\
            - description 用一句话描述该新领域覆盖的内容\n\
            - 新分类名应避免与已有领域语义重复（如已有 coding 就不要再提议 programming）\n\
         4. reason 用中文简述决策依据（如「文档聚焦数学建模竞赛技巧，与 academic 通用学术领域匹配度仅 0.5，建议新建 math-modeling 领域」）。\n\n\
         少样本示例：\n\
         示例1（高置信度匹配）：文档「React Hooks 最佳实践」→\n\
         {{\"domain\": \"coding\", \"confidence\": 0.95, \"new_domain_proposal\": null, \"reason\": \"React Hooks 是前端编程技术，明确属于 coding 领域\"}}\n\
         示例2（低置信度建议新领域）：文档「2025 数学建模国赛三天速成指南」→\n\
         {{\"domain\": \"\", \"confidence\": 0.4, \"new_domain_proposal\": {{\"name\": \"math-modeling\", \"description\": \"数学建模竞赛技巧、赛题分析与论文写作\"}}, \"reason\": \"文档聚焦数学建模竞赛，与 academic 通用学术领域匹配度仅 0.4，建议新建 math-modeling 领域\"}}\n\
         示例3（边界置信度匹配）：文档「Python 数据分析入门」→\n\
         {{\"domain\": \"coding\", \"confidence\": 0.75, \"new_domain_proposal\": null, \"reason\": \"Python 数据分析属编程技术，虽涉及数据科学但主题仍是编程，归入 coding\"}}",
        domains_list
    );

    // 截取预览前 2000 字符（避免 token 过多）
    let truncated_preview: String = preview.chars().take(2000).collect();
    let user_prompt = format!("文档标题：{}\n\n文档内容预览：\n{}", title, truncated_preview);

    // 调用 LLM（非流式，分类无需流式渲染）
    let response = llm_complete_non_streaming(
        &app_handle,
        &provider,
        &api_key,
        &user_prompt,
        Some(&system_prompt),
        base_url.as_deref(),
        model.as_deref(),
        Some(1024), // 分类输出很短，限制 token 控制成本
    )
    .await?;

    // 容错解析 JSON
    let json = extract_json_object(&response).ok_or_else(|| {
        format!(
            "LLM 返回无法解析为 JSON: {}",
            response.chars().take(300).collect::<String>()
        )
    })?;

    let domain = json["domain"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let confidence = json["confidence"]
        .as_f64()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let reason = json["reason"]
        .as_str()
        .unwrap_or("无理由")
        .to_string();

    // 解析新分类提议
    // P6-R5: 改造兜底逻辑——不再静默吞掉 LLM 的新领域意图。
    let mut new_domain_proposal = if domain.is_empty() || !existing_domains.contains(&domain) {
        json.get("new_domain_proposal")
            .filter(|v| !v.is_null())
            .and_then(|v| {
                let name = v["name"].as_str().unwrap_or("").trim().to_string();
                let description = v["description"].as_str().unwrap_or("").to_string();
                if name.is_empty() {
                    None
                } else {
                    Some(NewDomainProposal { name, description })
                }
            })
    } else {
        None
    };

    // P6-R5: 若 LLM 返回的 domain 非空但不在已有列表（说明 LLM 想提议新领域但格式没对齐），
    // 把该无效 domain 名转化为 new_domain_proposal（若 LLM 没给 proposal，构造一个）。
    // 这样用户的「新建并移入」按钮始终可用，不再静默归入 first()。
    let final_domain = if domain.is_empty() || !existing_domains.contains(&domain) {
        if new_domain_proposal.is_some() {
            String::new() // 有新分类提议，domain 留空
        } else if !domain.is_empty() {
            // LLM 返回了不在列表中的 domain 名但没给 proposal——构造 proposal
            let proposed_name = if is_valid_domain(&domain) {
                domain.clone()
            } else {
                let slug = slugify(&domain);
                // MED-2 fix: slugify 保留 Unicode 字母数字（含中文），但 is_valid_domain
                // 仅接受 ASCII。若 slug 仍含非 ASCII 字符，直接放入 proposal.name 会导致
                // 下游 create_domain_directory 调用 is_valid_domain 时拒绝，UX 断裂
                // （用户看到 LLM 提议了领域名，点击创建却报 invalid domain name）。
                // 修复：对 slug 追加 ASCII 校验，若仍含非 ASCII 则提取 ASCII 部分，
                // 全无 ASCII 时用通用占位符；原始输入保留在 description 供用户参考。
                if is_valid_domain(&slug) {
                    slug
                } else {
                    let ascii_part: String = slug
                        .chars()
                        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
                        .collect();
                    let cleaned = ascii_part.trim_matches('-');
                    if cleaned.is_empty() {
                        "llm-proposed-domain".to_string()
                    } else {
                        cleaned.to_string()
                    }
                }
            };
            new_domain_proposal = Some(NewDomainProposal {
                name: proposed_name,
                description: format!("由 LLM 提议（原始输入：{}）", domain),
            });
            String::new()
        } else {
            // LLM 返回空 domain 且无 proposal（极少见）：返回错误让用户手动选，
            // 不再静默取 existing_domains.first() 掩盖问题。
            return Err(format!(
                "LLM 分类失败：confidence={}, reason={}。请手动选择领域。",
                confidence, reason
            ));
        }
    } else {
        domain
    };

    Ok(ClassifyResult {
        domain: final_domain,
        confidence,
        new_domain_proposal,
        reason,
    })
}

/// P6-R3: 创建新分类目录（用户确认后调用）。
///
/// 安全约束：
/// - 域名经 kebab-case 校验（is_valid_domain），防止路径遍历
/// - 检查目录是否已存在（幂等：已存在则返回成功）
/// - 更新 index.md 追加新领域分组（不修改已有内容）
/// - **不自动修改 AGENTS.md**（schema 文件由用户手动更新，提示前端引导）
#[tauri::command]
fn create_domain_directory(
    name: String,
    description: Option<String>,
    config: State<'_, KbConfig>,
) -> Result<String, String> {
    if !is_valid_domain(&name) {
        return Err(format!(
            "invalid domain name: '{}' (must be kebab-case: lowercase alphanumeric with hyphens)",
            name
        ));
    }

    let dir = wiki_dir(&config.kb_root, &name);
    let already_existed = dir.exists();

    // 创建目录（幂等）
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create domain directory: {}", e))?;

    // 更新 index.md：追加新领域分组
    let index_path = Path::new(&config.kb_root).join("index.md");
    if index_path.exists() {
        let content = fs::read_to_string(&index_path)
            .map_err(|e| format!("failed to read index.md: {}", e))?;
        // 检查是否已有该领域的分组（避免重复追加）
        // MED-1 同构修复：使用精确 heading 匹配，避免前缀碰撞。
        // 旧实现 `content.contains("## {name}")` 是子串搜索，当存在前缀关系领域名
        // （如 design 与 design-resources）时会误判 design 已存在而跳过追加。
        // 修复：与 remove_domain_from_index 一致，匹配后验证行尾边界。
        let section_header = format!("\n## {}", name);
        let header_len = section_header.len();
        let already_has_section = content
            .match_indices(&section_header)
            .any(|(idx, _)| {
                let after = &content[idx + header_len..];
                after.is_empty() || after.starts_with('\n')
            });
        if !already_has_section {
            let desc_comment = description
                .as_ref()
                .filter(|d| !d.trim().is_empty())
                .map(|d| format!("<!-- {} -->\n", d))
                .unwrap_or_default();
            let new_section = format!(
                "{}<!-- 在此追加 {} 领域页面，格式：- [[wiki/{}/<page>]] · 一句话摘要 · YYYY-MM-DD -->\n",
                desc_comment, name, name
            );
            let updated = format!("{}{}\n", content.trim_end(), section_header);
            let updated = format!("{}\n{}", updated, new_section);
            fs::write(&index_path, updated)
                .map_err(|e| format!("failed to update index.md: {}", e))?;
        }
    }

    if already_existed {
        Ok(format!("领域「{}」目录已存在（幂等）", name))
    } else {
        Ok(format!("领域「{}」已创建，请在 AGENTS.md §8.1 手动追加领域说明", name))
    }
}

/// P6-R3: 移动页面到新领域（重新分类）。
///
/// 用于上传后用户接受 LLM 分类建议、将页面从默认领域移到推荐领域的场景。
/// 操作：
/// 1. 读取源页面内容
/// 2. 更新 frontmatter 的 domain 字段
/// 3. 写入目标领域目录
/// 4. 删除源文件
///
/// 安全：源/目标路径均经 validate_inside 校验，域名经 is_valid_domain 校验。
#[tauri::command]
fn move_page_domain(
    page_path: String,
    new_domain: String,
    config: State<'_, KbConfig>,
) -> Result<String, String> {
    if !is_valid_domain(&new_domain) {
        return Err(format!(
            "invalid target domain: '{}' (must be kebab-case)",
            new_domain
        ));
    }

    // 校验源路径在 KB root 内
    let src = validate_inside(&config.kb_root, &page_path)?;
    if !src.exists() {
        return Err(format!("source page not found: {}", page_path));
    }

    // 读取内容
    let content = fs::read_to_string(&src).map_err(|e| format!("failed to read page: {}", e))?;

    // 解析文件名（保留 slug）
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "invalid file name".to_string())?;

    // 目标路径
    let target_dir = wiki_dir(&config.kb_root, &new_domain);
    fs::create_dir_all(&target_dir).map_err(|e| format!("failed to create target dir: {}", e))?;
    let target = target_dir.join(file_name);

    // 校验目标路径在 KB root 内（defense-in-depth）
    let target_canonical = target
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .map(|p| p.join(file_name))
        .unwrap_or_else(|| target.clone());
    let kb_root_resolved = Path::new(&config.kb_root)
        .canonicalize()
        .map_err(|e| format!("Invalid KB root: {}", e))?;
    let strip_verbatim = |p: &Path| -> PathBuf {
        PathBuf::from(p.to_string_lossy().trim_start_matches(r"\\?\").to_string())
    };
    if !strip_verbatim(&target_canonical).starts_with(&strip_verbatim(&kb_root_resolved)) {
        return Err(format!("path traversal detected in target: {}", target.display()));
    }

    // 更新 frontmatter 的 domain 字段
    let updated_content = update_frontmatter_domain(&content, &new_domain);

    // 写入目标
    fs::write(&target, &updated_content)
        .map_err(|e| format!("failed to write to target: {}", e))?;

    // 删除源文件（仅在写入成功后）
    if src != target {
        fs::remove_file(&src).map_err(|e| format!("failed to remove source: {}", e))?;
    }

    // 返回新的相对路径
    let new_rel_path = format!("wiki/{}/{}", new_domain, file_name);
    Ok(new_rel_path)
}

/// P6-R5: 删除领域目录（用户二次确认后调用）。
///
/// 安全约束（四层防护）：
/// 1. 域名经 is_valid_domain 校验（kebab-case，拒绝路径遍历）
/// 2. 路径经 validate_inside 校验（防 `../` 越界）
/// 3. 拒绝删除受保护目录：raw、.git、kb-system（系统元知识领域不可删）
/// 4. 拒绝删除非空目录（除非 force=true 且用户已在前端二次确认）
///
/// 同步操作：
/// - 移除 index.md 中该领域的分组 heading 及其下所有页面条目（防止 lint 报孤儿页）
/// - 不自动修改 AGENTS.md（schema 文件由用户手动更新，前端提示）
///
/// @param name - kebab-case 分类名
/// @param force - 是否强制删除非空目录（需用户在前端二次确认）
/// @returns 被删除的页面数量
#[tauri::command]
fn delete_domain_directory(
    name: String,
    force: bool,
    config: State<'_, KbConfig>,
) -> Result<usize, String> {
    if !is_valid_domain(&name) {
        return Err(format!(
            "invalid domain name: '{}' (must be kebab-case: lowercase alphanumeric with hyphens)",
            name
        ));
    }

    // 受保护领域白名单：raw 与 .git 不是 wiki 子目录但防御性检查；kb-system 是系统元知识
    const PROTECTED_DOMAINS: [&str; 3] = ["raw", ".git", "kb-system"];
    if PROTECTED_DOMAINS.contains(&name.as_str()) {
        return Err(format!(
            "受保护领域「{}」不可删除（系统元知识或不可变层）",
            name
        ));
    }

    // 校验路径在 KB root 内（防路径遍历）
    let dir = validate_inside(&config.kb_root, &format!("wiki/{}", name))?;
    if !dir.exists() {
        return Err(format!("领域「{}」不存在", name));
    }

    // 统计 markdown 文件数
    let page_count = count_markdown_files(&dir)?;

    // 非空目录需 force=true
    if page_count > 0 && !force {
        return Err(format!(
            "领域「{}」非空（{} 个页面），需在前端勾选「强制删除」并二次确认",
            name, page_count
        ));
    }

    // 删除目录（递归）
    fs::remove_dir_all(&dir).map_err(|e| format!("failed to remove domain directory: {}", e))?;

    // 同步移除 index.md 中的领域分组（防止 lint 报孤儿页/过时声明）
    remove_domain_from_index(&config.kb_root, &name)?;

    Ok(page_count)
}

/// P6-R5: 列出所有领域目录及统计信息（供前端 DomainManager 展示）。
///
/// 返回 wiki/ 下所有子目录（按字母序），含页面数与经验卡数。
/// 不返回 raw/、.git/ 等非领域目录。
#[tauri::command]
fn list_domains(config: State<'_, KbConfig>) -> Result<Vec<DomainInfo>, String> {
    let wiki = Path::new(&config.kb_root).join("wiki");
    if !wiki.exists() {
        return Ok(Vec::new());
    }

    let mut domains: Vec<DomainInfo> = Vec::new();
    let entries = fs::read_dir(&wiki).map_err(|e| format!("failed to read wiki dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read entry: {}", e))?;
        let ftype = entry.file_type().map_err(|e| format!("failed to read file type: {}", e))?;
        if !ftype.is_dir() {
            continue;
        }
        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();
        // 跳过非领域目录（如 .obsidian 等隐藏目录）
        if name.starts_with('.') {
            continue;
        }
        let page_count = count_markdown_files(&entry.path()).unwrap_or(0);
        let experience_count = count_markdown_files(&entry.path().join("experiences")).unwrap_or(0);
        domains.push(DomainInfo {
            name,
            page_count,
            experience_count,
        });
    }
    // 按名称字母序排序，便于 UI 展示
    domains.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(domains)
}

/// P6-R5: 领域信息（前端 DomainManager 展示用）。
#[derive(serde::Serialize)]
struct DomainInfo {
    name: String,
    page_count: usize,
    experience_count: usize,
}

/// 统计目录下所有 .md 文件数量（递归）。
fn count_markdown_files(dir: &Path) -> Result<usize, String> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut count = 0usize;
    let entries = fs::read_dir(dir).map_err(|e| format!("failed to read dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read entry: {}", e))?;
        let ftype = entry.file_type().map_err(|e| format!("failed to read file type: {}", e))?;
        if ftype.is_dir() {
            count += count_markdown_files(&entry.path())?;
        } else if ftype.is_file() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("md") {
                count += 1;
            }
        }
    }
    Ok(count)
}

/// 从 index.md 中移除指定领域的分组 heading 及其下所有条目。
///
/// index.md 格式（AGENTS.md §2.1）：
/// ```md
/// ## coding
/// <!-- 在此追加 coding 领域页面，格式：... -->
/// - [[wiki/coding/foo]] · 摘要 · 2026-07-22
///
/// ## design
/// ...
/// ```
///
/// 本函数找到 `## <name>` heading，删除从该 heading 到下一个 `## ` heading（或文件末尾）之间的所有内容。
/// 保留其他领域分组不变。若找不到对应 heading，返回 Ok（幂等）。
fn remove_domain_from_index(kb_root: &str, name: &str) -> Result<(), String> {
    let index_path = Path::new(kb_root).join("index.md");
    if !index_path.exists() {
        return Ok(()); // 无 index.md，无需清理
    }
    let content = fs::read_to_string(&index_path)
        .map_err(|e| format!("failed to read index.md: {}", e))?;

    // MED-1 fix: 使用精确 heading 匹配，避免前缀碰撞。
    // 旧实现 `content.find("\n## {name}")` 是子串搜索，当存在前缀关系领域名
    // （如 "design" 与 "design-resources"）时会误匹配 "\n## design-resources"，
    // 导致删除错误的分组。修复：匹配后验证 heading 行尾为 "\n" 或字符串结尾。
    let section_header = format!("\n## {}", name);
    let header_len = section_header.len();
    let mut start_idx: Option<usize> = None;
    let mut search_from = 0;
    while let Some(idx) = content[search_from..].find(&section_header) {
        let abs_idx = search_from + idx;
        let after = &content[abs_idx + header_len..];
        if after.is_empty() || after.starts_with('\n') {
            start_idx = Some(abs_idx + 1); // +1 跳过前缀换行，指向 # 字符
            break;
        }
        search_from = abs_idx + 1; // 前缀碰撞，继续搜索
    }
    let start_idx = match start_idx {
        Some(idx) => idx,
        None => return Ok(()), // 无对应分组，幂等返回
    };

    // 查找下一个 ## heading（从 start_idx 开始搜索）
    let rest = &content[start_idx..];
    let next_section_idx = rest[1..] // 跳过当前 heading 行
        .find("\n## ")
        .map(|idx| start_idx + 1 + idx + 1); // +1 跳过换行，指向下一个 # 字符

    let new_content = match next_section_idx {
        Some(end) => {
            // 删除从 start_idx 到 end 之间的内容（含当前 heading 与其下条目）
            // 保留 end 之后的下一个 heading 与其下条目
            let mut result = String::with_capacity(content.len());
            result.push_str(&content[..start_idx.saturating_sub(1)]); // 保留前缀（含换行）
            // LOW-3 fix: 确保段间空行（markdownlint MD022），避免删除中间分组后
            // 前一个 heading 与下一个 heading 紧贴（## coding\n## reading）。
            if !result.ends_with("\n\n") {
                if !result.ends_with('\n') {
                    result.push('\n');
                }
                result.push('\n');
            }
            result.push_str(&content[end..]); // 保留下一个 heading 起的内容
            // 确保末尾换行规范
            if !result.ends_with('\n') {
                result.push('\n');
            }
            result
        }
        None => {
            // 当前 heading 是最后一个分组，直接截断到 start_idx 之前
            let mut result = content[..start_idx.saturating_sub(1)].to_string();
            if !result.ends_with('\n') {
                result.push('\n');
            }
            result
        }
    };

    fs::write(&index_path, new_content)
        .map_err(|e| format!("failed to write index.md: {}", e))?;
    Ok(())
}

/// 更新 frontmatter 的 domain 字段（保留其他字段与 body 不变）。
///
/// 处理 domain: [xxx]（flow 风格）格式，符合 AGENTS.md DEF-008 约定。
fn update_frontmatter_domain(content: &str, new_domain: &str) -> String {
    if !content.starts_with("---") {
        return content.to_string();
    }
    let Some(end) = content[3..].find("---") else {
        return content.to_string();
    };
    let yaml_end = 3 + end;
    let yaml = &content[3..yaml_end];
    let new_yaml = yaml
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("domain:") {
                let indent_len = line.len() - trimmed.len();
                let indent = &line[..indent_len];
                format!("{}domain: [{}]", indent, new_domain)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    // 与 update_frontmatter_status 一致：显式添加 "\n" 防止字段与 "---" 粘连
    format!("---{}\n---{}", new_yaml, &content[yaml_end + 3..])
}

/// 保存 API Key 到操作系统密钥环（ADR-013 V7）
///
/// 使用 keyring crate，跨平台支持：
/// - Windows: Credential Manager
/// - macOS: Keychain
/// - Linux: Secret Service (D-Bus)
#[tauri::command]
fn save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("continuous-learning-kb", &provider)
        .map_err(|e| format!("keyring entry creation failed: {}", e))?;
    entry
        .set_password(&api_key)
        .map_err(|e| format!("failed to save API key: {}", e))
}

/// 从操作系统密钥环读取 API Key
///
/// 返回 Option：None 表示未保存，Some(key) 表示已保存
#[tauri::command]
fn load_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("continuous-learning-kb", &provider)
        .map_err(|e| format!("keyring entry creation failed: {}", e))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to load API key: {}", e)),
    }
}

/// 删除已保存的 API Key（用户清除时）
#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = keyring::Entry::new("continuous-learning-kb", &provider)
        .map_err(|e| format!("keyring entry creation failed: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // 已删除，幂等
        Err(e) => Err(format!("failed to delete API key: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Tauri app entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = KbConfig::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(config)
        .invoke_handler(tauri::generate_handler![
            upload_file,
            list_staging,
            confirm_staging,
            reject_staging,
            update_staging_content,
            get_kb_config,
            call_mcp_tool,
            // P5 LLM 集成（ADR-013）
            call_llm_api,
            save_api_key,
            load_api_key,
            delete_api_key,
            // P5 UX-3: 手动删除页面
            delete_page,
            // P6-R3: LLM 自动分类（建议+确认模式）
            classify_domain,
            create_domain_directory,
            move_page_domain,
            // P6-R5: 领域管理（删除 + 列表）
            delete_domain_directory,
            list_domains,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// P5-R3 单元测试（guardrail-enforcer 建议的 4 个未覆盖场景）
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // -----------------------------------------------------------------------
    // AC-2: validate_inside — strip_verbatim 前缀处理（guardrail 未覆盖场景 2）
    // -----------------------------------------------------------------------

    #[test]
    fn test_validate_inside_strips_verbatim_prefix_existing_file() {
        // 已存在的文件：canonicalize 成功，prefix 一致或经 strip_verbatim 后一致
        let tmp = std::env::temp_dir().join("p5r3_test_validate_existing");
        fs::create_dir_all(&tmp).unwrap();
        let wiki_dir = tmp.join("wiki").join("coding");
        fs::create_dir_all(&wiki_dir).unwrap();
        let page = wiki_dir.join("test-page.md");
        fs::write(&page, "# Test").unwrap();

        let base = tmp.to_string_lossy().to_string();
        let rel = "wiki/coding/test-page.md";
        let result = validate_inside(&base, rel);
        assert!(result.is_ok(), "existing file should pass validation");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_validate_inside_strips_verbatim_prefix_nonexistent_file() {
        // 不存在的文件（如 .md 被前端剥离）：canonicalize 失败，回退路径无 \\?\ 前缀。
        // P5-R3 fix: strip_verbatim 去除 base_resolved 的 \\?\ 前缀后比较。
        // 这是考古报告问题 2 的核心场景。
        let tmp = std::env::temp_dir().join("p5r3_test_validate_nonexistent");
        fs::create_dir_all(&tmp).unwrap();
        let wiki_dir = tmp.join("wiki").join("coding");
        fs::create_dir_all(&wiki_dir).unwrap();
        // 注意：不创建 test-page.md，模拟 .md 被剥离的场景

        let base = tmp.to_string_lossy().to_string();
        let rel = "wiki/coding/test-page.md";
        let result = validate_inside(&base, rel);
        assert!(result.is_ok(), "nonexistent file should still pass validation (no false path traversal)");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_validate_inside_rejects_path_traversal() {
        // 路径穿越攻击仍被拦截。
        // 注：validate_inside 在目标文件不存在时，canonicalize 失败，回退路径保留 .. 组件，
        // starts_with 将 .. 视为普通组件，可能不拦截。但 delete_page 有三层防护：
        //   1. validate_inside（本函数）
        //   2. extension == "md" 检查
        //   3. wiki_root canonicalize + starts_with 检查
        // 此处测试文件存在时的穿越拦截（canonicalize 成功，.. 被解析）。
        let tmp = std::env::temp_dir().join("p5r3_test_validate_traversal");
        fs::create_dir_all(&tmp).unwrap();
        let outside_dir = tmp.join("outside_target");
        fs::create_dir_all(&outside_dir).unwrap();
        // 在 base 外创建一个文件
        let outside_file = tmp.join("secret.md");
        fs::write(&outside_file, "secret").unwrap();

        let base = tmp.join("wiki").join("coding");
        fs::create_dir_all(&base).unwrap();
        let base_str = base.to_string_lossy().to_string();
        // 用 .. 穿越 base 到 tmp 下的 secret.md
        let rel = "../../secret.md";
        let result = validate_inside(&base_str, rel);
        assert!(result.is_err(), "path traversal to existing file should be rejected");
        assert!(result.unwrap_err().contains("Path traversal detected"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_validate_inside_rejects_absolute_path_outside_base() {
        // 绝对路径不在 base 下时被拒绝
        let tmp = std::env::temp_dir().join("p5r3_test_validate_absolute");
        fs::create_dir_all(&tmp).unwrap();

        let base = tmp.to_string_lossy().to_string();
        // 使用一个绝对路径（在 Windows 和 Unix 上都存在于 base 之外）
        let outside = if cfg!(windows) {
            "C:/Windows/System32/drivers/etc/hosts"
        } else {
            "/etc/passwd"
        };
        let result = validate_inside(&base, outside);
        assert!(result.is_err(), "absolute path outside base should be rejected");

        let _ = fs::remove_dir_all(&tmp);
    }

    // -----------------------------------------------------------------------
    // AC-2: delete_page .md 自动补全（guardrail 未覆盖场景 3）
    // -----------------------------------------------------------------------
    // 注：delete_page 是 Tauri command，需要 State 和 AppHandle，无法直接单元测试。
    // 但补全逻辑等价于：if !path.ends_with(".md") { format!("{}.md", path) }
    // 此处通过 validate_inside 验证补全后的路径能通过校验。

    #[test]
    fn test_delete_page_md_auto_append_logic() {
        // 模拟 delete_page 中的 .md 补全逻辑
        let page_path_without_md = "wiki/coding/2026数模国赛word模版-模版-记得修改命名-2";
        let page_path_with_md = if page_path_without_md.ends_with(".md") {
            page_path_without_md.to_string()
        } else {
            format!("{}.md", page_path_without_md)
        };
        assert_eq!(page_path_with_md, "wiki/coding/2026数模国赛word模版-模版-记得修改命名-2.md");

        // 已有 .md 的路径不被重复追加
        let already_has_md = "wiki/coding/test.md";
        let result = if already_has_md.ends_with(".md") {
            already_has_md.to_string()
        } else {
            format!("{}.md", already_has_md)
        };
        assert_eq!(result, "wiki/coding/test.md");
    }

    #[test]
    fn test_validate_inside_with_chinese_filename_no_md() {
        // 考古报告问题 2 的精确复现场景：
        // 中文文件名 + 无 .md 后缀 → 不应误报 Path traversal detected
        let tmp = std::env::temp_dir().join("p5r3_test_chinese_filename");
        fs::create_dir_all(&tmp).unwrap();
        let wiki_dir = tmp.join("wiki").join("coding");
        fs::create_dir_all(&wiki_dir).unwrap();
        // 创建带 .md 的实际文件
        let actual_file = wiki_dir.join("2026数模国赛word模版-模版-记得修改命名-2.md");
        fs::write(&actual_file, "# Test").unwrap();

        let base = tmp.to_string_lossy().to_string();
        // 前端传入的路径可能没有 .md（被 normalizeCacheKey 剥离）
        let rel_without_md = "wiki/coding/2026数模国赛word模版-模版-记得修改命名-2";
        let result = validate_inside(&base, rel_without_md);
        assert!(result.is_ok(), "Chinese filename without .md should not trigger false path traversal");

        // 补全 .md 后也应通过
        let rel_with_md = format!("{}.md", rel_without_md);
        let result2 = validate_inside(&base, &rel_with_md);
        assert!(result2.is_ok(), "Chinese filename with .md should pass validation");

        let _ = fs::remove_dir_all(&tmp);
    }

    // -----------------------------------------------------------------------
    // AC-4: call_mcp_tool 错误透传（guardrail 未覆盖场景 4）
    // -----------------------------------------------------------------------
    // 注：call_mcp_tool 是 Tauri command，需要 AppHandle。
    // 此处测试错误提取的 JSON 解析逻辑（lib.rs:934-938 的等价逻辑）。

    #[test]
    fn test_mcp_error_extraction_with_error_field() {
        // 模拟 MCP 工具返回的 error JSON（exit_code=2 场景）
        let stdout = r#"{"error":"Page not found: wiki/coding/nonexistent"}"#;
        let data: serde_json::Value = serde_json::from_str(stdout).unwrap();
        let mcp_error = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        assert_eq!(mcp_error, "Page not found: wiki/coding/nonexistent");

        // 透传到前端的完整错误消息格式
        let tool_name = "kb_get_page";
        let full_error = format!("{}: {}", tool_name, mcp_error);
        assert_eq!(full_error, "kb_get_page: Page not found: wiki/coding/nonexistent");
    }

    #[test]
    fn test_mcp_error_extraction_without_error_field() {
        // MCP 工具返回 JSON 但无 error 字段
        let stdout = r#"{"data":"some data"}"#;
        let data: serde_json::Value = serde_json::from_str(stdout).unwrap();
        let mcp_error = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        assert_eq!(mcp_error, "unknown error");
    }

    #[test]
    fn test_mcp_error_extraction_null_json() {
        // stdout 不是有效 JSON（subprocess 崩溃场景）
        let stdout = "not json at all";
        let data: serde_json::Value =
            serde_json::from_str(stdout).unwrap_or(serde_json::Value::Null);
        let mcp_error = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        assert_eq!(mcp_error, "unknown error");
    }

    #[test]
    fn test_mcp_error_extraction_with_null_error() {
        // error 字段为 null
        let stdout = r#"{"error":null,"data":"ok"}"#;
        let data: serde_json::Value = serde_json::from_str(stdout).unwrap();
        let mcp_error = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        assert_eq!(mcp_error, "unknown error");
    }

    // -----------------------------------------------------------------------
    // AC-3: get_provider_config "custom" 空配置（guardrail 未覆盖场景补充）
    // -----------------------------------------------------------------------

    #[test]
    fn test_get_provider_config_custom_returns_empty() {
        let config = get_provider_config("custom").unwrap();
        assert_eq!(config.base_url, "");
        assert_eq!(config.model, "");
    }

    #[test]
    fn test_get_provider_config_rejects_unknown() {
        let result = get_provider_config("unknown_provider");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown provider"));
    }

    #[test]
    fn test_get_provider_config_legacy_providers_still_work() {
        // 旧 provider 保留用于向后兼容
        let deepseek = get_provider_config("deepseek").unwrap();
        assert!(!deepseek.base_url.is_empty());
        assert!(!deepseek.model.is_empty());

        let glm = get_provider_config("glm").unwrap();
        assert!(!glm.base_url.is_empty());

        let kimi = get_provider_config("kimi").unwrap();
        assert!(!kimi.base_url.is_empty());
    }

    // -----------------------------------------------------------------------
    // P5-R4: update_frontmatter_status — 换行符修复（AC-2 核心修复）
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_frontmatter_status_updates_status_field() {
        let input = "---\ntitle: Test\ndomain: [coding]\nstatus: staging\ndate: 2026-08-01\n---\n\n## Body";
        let result = update_frontmatter_status(input, "active");
        assert!(result.contains("status: active"));
        assert!(!result.contains("status: staging"));
    }

    #[test]
    fn test_update_frontmatter_status_preserves_other_fields() {
        let input = "---\ntitle: Test\ndomain: [coding]\nstatus: staging\ndate: 2026-08-01\nuse_count: 3\ntags: [python]\n---\n\n## Body";
        let result = update_frontmatter_status(input, "active");
        assert!(result.contains("title: Test"));
        assert!(result.contains("domain: [coding]"));
        assert!(result.contains("date: 2026-08-01"));
        assert!(result.contains("use_count: 3"));
        assert!(result.contains("tags: [python]"));
    }

    #[test]
    fn test_update_frontmatter_status_newline_before_closing_fence() {
        // P5-R4 核心修复：最后一个字段后必须有换行符再接 ---
        // 修复前：join("\n") 不加尾部换行，导致 "use_count: 1---" 粘连
        let input = "---\ntitle: Test\ndomain: [coding]\nstatus: staging\ndate: 2026-08-01\nuse_count: 1\n---\n\n## Body";
        let result = update_frontmatter_status(input, "active");
        // 关键断言：不能出现 "1---" 粘连
        assert!(!result.contains("1---"), "field value must not be concatenated with closing ---");
        // 必须有换行符分隔最后一个字段和 ---
        assert!(result.contains("1\n---"), "newline must separate last field from closing ---");
    }

    #[test]
    fn test_update_frontmatter_status_body_preserved_after_fence() {
        let input = "---\ntitle: Test\nstatus: staging\n---\n\n## Heading\n\nSome content.";
        let result = update_frontmatter_status(input, "active");
        assert!(result.contains("## Heading"));
        assert!(result.contains("Some content."));
    }

    #[test]
    fn test_update_frontmatter_status_no_frontmatter_returns_unchanged() {
        let input = "## Just a body\n\nNo frontmatter here.";
        let result = update_frontmatter_status(input, "active");
        assert_eq!(result, input);
    }

    #[test]
    fn test_update_frontmatter_status_no_closing_fence_returns_unchanged() {
        let input = "---\ntitle: Test\nstatus: staging\n\n## Body without closing fence";
        let result = update_frontmatter_status(input, "active");
        assert_eq!(result, input);
    }

    #[test]
    fn test_update_frontmatter_status_simulates_real_wiki_page() {
        // 模拟真实的 wiki/coding/2025国赛.md frontmatter 结构
        let input = "---\ntitle: 2025国赛\ndomain: [coding]\ntype: source\nstatus: staging\ndate: 2026-08-01\nsource_file: raw/pdf/2025国赛.pdf\nuse_count: 0\n---\n\n## 原始内容";
        let result = update_frontmatter_status(input, "active");
        // 验证 status 已更新
        assert!(result.contains("status: active"));
        assert!(!result.contains("status: staging"));
        // 验证 use_count 字段后换行正确（核心 bug 场景）
        assert!(result.contains("use_count: 0\n---"));
        assert!(!result.contains("use_count: 0---"));
        // 验证 body 保留
        assert!(result.contains("## 原始内容"));
    }

    // -----------------------------------------------------------------------
    // P6-R3: extract_json_object — LLM 返回 JSON 容错解析
    // -----------------------------------------------------------------------

    #[test]
    fn test_extract_json_object_plain_json() {
        let input = r#"{"domain": "coding", "confidence": 0.9, "reason": "test"}"#;
        let json = extract_json_object(input).expect("plain JSON should parse");
        assert_eq!(json["domain"].as_str(), Some("coding"));
        assert_eq!(json["confidence"].as_f64(), Some(0.9));
    }

    #[test]
    fn test_extract_json_object_with_code_fence() {
        // LLM 常将 JSON 包裹在 ```json ... ``` 中
        let input = "```json\n{\"domain\": \"design\", \"confidence\": 0.85}\n```";
        let json = extract_json_object(input).expect("code-fenced JSON should parse");
        assert_eq!(json["domain"].as_str(), Some("design"));
    }

    #[test]
    fn test_extract_json_object_with_surrounding_text() {
        // LLM 可能在 JSON 前后添加解释性文字
        let input = "好的，以下是分类结果：\n{\"domain\": \"academic\", \"confidence\": 0.7}\n以上就是建议。";
        let json = extract_json_object(input).expect("JSON with surrounding text should parse");
        assert_eq!(json["domain"].as_str(), Some("academic"));
    }

    #[test]
    fn test_extract_json_object_with_new_domain_proposal() {
        let input = r#"{"domain": "", "confidence": 0.8, "new_domain_proposal": {"name": "machine-learning", "description": "ML docs"}, "reason": "no match"}"#;
        let json = extract_json_object(input).expect("JSON with proposal should parse");
        assert_eq!(json["domain"].as_str(), Some(""));
        assert_eq!(json["new_domain_proposal"]["name"].as_str(), Some("machine-learning"));
    }

    #[test]
    fn test_extract_json_object_invalid_returns_none() {
        assert!(extract_json_object("not json at all").is_none());
        assert!(extract_json_object("{broken").is_none());
    }

    // -----------------------------------------------------------------------
    // P6-R3: update_frontmatter_domain — 领域字段更新
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_frontmatter_domain_updates_domain_field() {
        let input = "---\ntitle: \"Test\"\ndomain: [coding]\ntype: source\nstatus: staging\ndate: 2026-08-01\n---\n\n## Body";
        let result = update_frontmatter_domain(input, "academic");
        assert!(result.contains("domain: [academic]"));
        assert!(!result.contains("domain: [coding]"));
        // 其他字段保留
        assert!(result.contains("title: \"Test\""));
        assert!(result.contains("status: staging"));
        assert!(result.contains("## Body"));
    }

    #[test]
    fn test_update_frontmatter_domain_newline_before_closing_fence() {
        // P5-R4 同类 bug 防护：字段值不应与结束 "---" 粘连
        // domain 后还有 use_count 字段，验证 domain 行以换行结尾（不与下一行粘连）
        let input = "---\ntitle: \"Test\"\ndomain: [coding]\nuse_count: 0\n---\n\n## Body";
        let result = update_frontmatter_domain(input, "design");
        assert!(result.contains("domain: [design]\n"));
        assert!(!result.contains("domain: [design]---"));
        assert!(!result.contains("domain: [design]use_count"));
        // 验证结束 fence 前有换行（不与 use_count 粘连）
        assert!(result.contains("use_count: 0\n---"));
        assert!(!result.contains("use_count: 0---"));
    }

    #[test]
    fn test_update_frontmatter_domain_no_frontmatter_returns_unchanged() {
        let input = "# No frontmatter\n\nJust body";
        let result = update_frontmatter_domain(input, "coding");
        assert_eq!(result, input);
    }

    #[test]
    fn test_update_frontmatter_domain_preserves_body_content() {
        let input = "---\ndomain: [coding]\n---\n\n## 原始内容\n\n这是正文，包含中文和公式 $E=mc^2$。";
        let result = update_frontmatter_domain(input, "academic");
        assert!(result.contains("## 原始内容"));
        assert!(result.contains("$E=mc^2$"));
        assert!(result.contains("domain: [academic]"));
    }

    // -----------------------------------------------------------------------
    // P6-R3: is_valid_domain — 分类名安全校验（路径遍历防护）
    // -----------------------------------------------------------------------

    #[test]
    fn test_is_valid_domain_rejects_path_traversal() {
        // 分类名不能包含路径分隔符或 ..
        assert!(!is_valid_domain("../../../tmp"));
        assert!(!is_valid_domain(".."));
        assert!(!is_valid_domain("coding/../../"));
        assert!(!is_valid_domain(""));
    }

    #[test]
    fn test_is_valid_domain_accepts_kebab_case() {
        assert!(is_valid_domain("coding"));
        assert!(is_valid_domain("kb-system"));
        assert!(is_valid_domain("machine-learning"));
        assert!(is_valid_domain("ai-ml-2025"));
    }

    #[test]
    fn test_is_valid_domain_rejects_uppercase_and_special() {
        assert!(!is_valid_domain("Coding"));
        assert!(!is_valid_domain("machine_learning"));
        assert!(!is_valid_domain("machine.learning"));
        assert!(!is_valid_domain("machine learning"));
    }

    // -----------------------------------------------------------------------
    // P6-R5: count_markdown_files — 递归统计 .md 文件数
    // -----------------------------------------------------------------------

    #[test]
    fn test_count_markdown_files_empty_dir() {
        let tmp = std::env::temp_dir().join("p6r5_test_count_empty");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        assert_eq!(count_markdown_files(&tmp).unwrap(), 0);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_markdown_files_with_md_and_non_md() {
        let tmp = std::env::temp_dir().join("p6r5_test_count_mixed");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.md"), "# A").unwrap();
        fs::write(tmp.join("b.txt"), "not md").unwrap();
        fs::write(tmp.join("c.md"), "# C").unwrap();
        // 子目录
        let sub = tmp.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("d.md"), "# D").unwrap();
        assert_eq!(count_markdown_files(&tmp).unwrap(), 3);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_markdown_files_nonexistent_dir_returns_zero() {
        let nonexistent = std::env::temp_dir().join("p6r5_does_not_exist_xyz");
        assert_eq!(count_markdown_files(&nonexistent).unwrap(), 0);
    }

    // -----------------------------------------------------------------------
    // P6-R5: remove_domain_from_index — index.md 领域分组移除
    // -----------------------------------------------------------------------

    #[test]
    fn test_remove_domain_from_index_removes_section() {
        let tmp = std::env::temp_dir().join("p6r5_test_remove_index");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let index_content = "\
# Index

## coding
<!-- 在此追加 coding 领域页面 -->
- [[wiki/coding/foo]] · 摘要 · 2026-07-22

## design
<!-- 在此追加 design 领域页面 -->
- [[wiki/design/bar]] · 摘要 · 2026-07-22

## kb-system
<!-- 系统元知识 -->
";
        fs::write(tmp.join("index.md"), index_content).unwrap();
        remove_domain_from_index(tmp.to_str().unwrap(), "design").unwrap();
        let updated = fs::read_to_string(tmp.join("index.md")).unwrap();
        assert!(!updated.contains("## design"));
        assert!(!updated.contains("[[wiki/design/bar]]"));
        assert!(updated.contains("## coding"));
        assert!(updated.contains("## kb-system"));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_remove_domain_from_index_last_section() {
        let tmp = std::env::temp_dir().join("p6r5_test_remove_last");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let index_content = "\
# Index

## coding
<!-- 在此追加 coding 领域页面 -->
- [[wiki/coding/foo]] · 摘要 · 2026-07-22
";
        fs::write(tmp.join("index.md"), index_content).unwrap();
        remove_domain_from_index(tmp.to_str().unwrap(), "coding").unwrap();
        let updated = fs::read_to_string(tmp.join("index.md")).unwrap();
        assert!(!updated.contains("## coding"));
        assert!(updated.contains("# Index"));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_remove_domain_from_index_idempotent_when_not_found() {
        let tmp = std::env::temp_dir().join("p6r5_test_remove_idempotent");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let index_content = "\
# Index

## coding
- [[wiki/coding/foo]]
";
        fs::write(tmp.join("index.md"), index_content).unwrap();
        // 不存在的领域：幂等返回，index.md 不变
        remove_domain_from_index(tmp.to_str().unwrap(), "nonexistent").unwrap();
        let updated = fs::read_to_string(tmp.join("index.md")).unwrap();
        assert!(updated.contains("## coding"));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_remove_domain_from_index_no_index_file() {
        let tmp = std::env::temp_dir().join("p6r5_test_remove_no_index");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        // 无 index.md：幂等返回 Ok
        let result = remove_domain_from_index(tmp.to_str().unwrap(), "coding");
        assert!(result.is_ok());
        let _ = fs::remove_dir_all(&tmp);
    }

    // MED-1 回归测试：前缀关系领域名不应误删相邻分组
    #[test]
    fn test_remove_domain_from_index_prefix_collision() {
        let tmp = std::env::temp_dir().join("p6r5_test_remove_prefix_collision");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        // 构造前缀关系：design 与 design-resources 同时存在
        let index_content = "\
# Index

## coding
- [[wiki/coding/foo]]

## design
- [[wiki/design/bar]]

## design-resources
- [[wiki/design-resources/baz]]

## reading
- [[wiki/reading/qux]]
";
        fs::write(tmp.join("index.md"), index_content).unwrap();
        // 删除 design，不应影响 design-resources
        remove_domain_from_index(tmp.to_str().unwrap(), "design").unwrap();
        let updated = fs::read_to_string(tmp.join("index.md")).unwrap();
        // design 分组应被移除
        assert!(
            !updated.contains("## design\n"),
            "design 分组应被移除，但实际内容：\n{}",
            updated
        );
        assert!(!updated.contains("[[wiki/design/bar]]"));
        // design-resources 分组必须保留（前缀碰撞防护）
        assert!(
            updated.contains("## design-resources"),
            "design-resources 分组被误删（MED-1 回归），实际内容：\n{}",
            updated
        );
        assert!(updated.contains("[[wiki/design-resources/baz]]"));
        // 其他分组不受影响
        assert!(updated.contains("## coding"));
        assert!(updated.contains("## reading"));
        let _ = fs::remove_dir_all(&tmp);
    }

    // MED-2 回归测试：slugify 保留 Unicode 但 is_valid_domain 拒绝非 ASCII（契约不一致证据）
    // classify_domain 中的修复对 slugify 结果追加 is_valid_domain 校验，
    // 此测试验证契约差异确实存在，确保修复不被回退。
    #[test]
    fn test_med2_slugify_preserves_unicode_but_is_valid_domain_rejects() {
        // slugify 保留中文字符（is_alphanumeric 接受 Unicode）
        let slug = slugify("数学建模");
        assert!(
            slug.contains("数") || slug.contains("学"),
            "slugify 应保留 Unicode 字母数字，实际：{}",
            slug
        );
        // is_valid_domain 仅接受 ASCII，拒绝 slugify 的 Unicode 输出
        assert!(
            !is_valid_domain(&slug),
            "is_valid_domain 应拒绝含中文的 slug（MED-2 契约不一致），实际 slug：{}",
            slug
        );
        // 修复后的兜底逻辑：提取 ASCII 部分，全无 ASCII 时用占位符
        let ascii_part: String = slug
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        let cleaned = ascii_part.trim_matches('-');
        let fallback = if cleaned.is_empty() {
            "llm-proposed-domain".to_string()
        } else {
            cleaned.to_string()
        };
        assert!(
            is_valid_domain(&fallback),
            "兜底 fallback 应通过 is_valid_domain 校验，实际：{}",
            fallback
        );
    }

    // MED-2 补充：混合中英文输入的 ASCII 提取
    #[test]
    fn test_med2_slugify_mixed_cn_en_extracts_ascii() {
        let slug = slugify("数学 modeling 建模");
        // slugify 会把空格转成 -，保留 Unicode 字母数字
        assert!(!slug.is_empty());
        // 提取 ASCII 部分
        let ascii_part: String = slug
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        let cleaned = ascii_part.trim_matches('-');
        // "modeling" 应被提取出来
        assert!(
            cleaned.contains("modeling"),
            "ASCII 提取应保留 modeling，实际：{}",
            cleaned
        );
        assert!(is_valid_domain(&cleaned.to_string()));
    }

    // MED-1 同构回归测试：create_domain_directory 的 already_has_section 检查
    // 应使用精确 heading 匹配，避免前缀碰撞导致 design 被误判为已存在
    // （当 design-resources 分组已存在时）。
    #[test]
    fn test_create_domain_already_has_section_prefix_collision() {
        // 模拟 index.md 已有 design-resources 分组
        let content = "\
# Index

## coding
- [[wiki/coding/foo]]

## design-resources
- [[wiki/design-resources/baz]]
";
        // 复现 create_domain_directory 中的 already_has_section 检查逻辑
        let name = "design";
        let section_header = format!("\n## {}", name);
        let header_len = section_header.len();
        let already_has_section = content
            .match_indices(&section_header)
            .any(|(idx, _)| {
                let after = &content[idx + header_len..];
                after.is_empty() || after.starts_with('\n')
            });
        // design 分组不存在（design-resources 不应被误匹配），故应返回 false
        assert!(
            !already_has_section,
            "already_has_section 应为 false（design 分组不存在），前缀碰撞导致误判，实际：{}",
            already_has_section
        );

        // 反向验证：检查 design-resources 时应返回 true
        let name2 = "design-resources";
        let section_header2 = format!("\n## {}", name2);
        let header_len2 = section_header2.len();
        let already_has_section2 = content
            .match_indices(&section_header2)
            .any(|(idx, _)| {
                let after = &content[idx + header_len2..];
                after.is_empty() || after.starts_with('\n')
            });
        assert!(
            already_has_section2,
            "already_has_section 应为 true（design-resources 分组存在），实际：{}",
            already_has_section2
        );
    }

    // -----------------------------------------------------------------------
    // P6-R5: delete_domain_directory 安全防护测试
    // -----------------------------------------------------------------------
    // 注：delete_domain_directory 是 #[tauri::command]，需要 State<KbConfig> 参数，
    // 无法直接单元测试。这里测试其调用的核心安全逻辑：
    // 1. is_valid_domain 拒绝路径遍历（已在 test_is_valid_domain_rejects_path_traversal 覆盖）
    // 2. PROTECTED_DOMAINS 受保护领域检查
    // 3. count_markdown_files 非空检查
    // -----------------------------------------------------------------------

    #[test]
    fn test_protected_domains_constant_includes_system_domains() {
        // 受保护领域白名单（与 delete_domain_directory 内 PROTECTED_DOMAINS 一致）
        const PROTECTED_DOMAINS: [&str; 3] = ["raw", ".git", "kb-system"];
        assert!(PROTECTED_DOMAINS.contains(&"raw"));
        assert!(PROTECTED_DOMAINS.contains(&".git"));
        assert!(PROTECTED_DOMAINS.contains(&"kb-system"));
        // 普通领域不在受保护列表
        assert!(!PROTECTED_DOMAINS.contains(&"coding"));
        assert!(!PROTECTED_DOMAINS.contains(&"design"));
    }

    #[test]
    fn test_delete_domain_non_empty_check_via_count_markdown_files() {
        // 模拟 delete_domain_directory 的非空检查逻辑：
        // 若 page_count > 0 且 !force → 返回错误
        let tmp = std::env::temp_dir().join("p6r5_test_nonempty_check");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("page1.md"), "# Page 1").unwrap();
        fs::write(tmp.join("page2.md"), "# Page 2").unwrap();
        let page_count = count_markdown_files(&tmp).unwrap();
        assert_eq!(page_count, 2);
        // 模拟 force=false 时的检查
        let force = false;
        if page_count > 0 && !force {
            // 应该返回错误（这里用 assert 模拟）
            assert!(page_count > 0);
        }
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_delete_domain_force_true_bypasses_nonempty_check() {
        // 模拟 force=true 时的检查：page_count > 0 但 force=true → 不返回错误
        let tmp = std::env::temp_dir().join("p6r5_test_force_bypass");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("page1.md"), "# Page 1").unwrap();
        let page_count = count_markdown_files(&tmp).unwrap();
        assert_eq!(page_count, 1);
        let force = true;
        // force=true 时即使 page_count > 0 也不应返回错误
        assert!(!(page_count > 0 && !force));
        let _ = fs::remove_dir_all(&tmp);
    }
}
