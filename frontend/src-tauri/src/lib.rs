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
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
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
    format!("---{}---{}", new_yaml, &content[yaml_end + 3..])
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
    if !resolved.starts_with(&base_resolved) {
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
    // M1 defense-in-depth: even with is_valid_domain check above, verify the
    // resolved path stays inside KB root before writing.
    let wiki_resolved = wiki_path
        .canonicalize()
        .unwrap_or_else(|_| wiki_path.clone());
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
    if let Some(parent) = wiki_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
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
        Ok(McpToolResult {
            success: false,
            data,
            error: Some(format!("tool '{}' returned error", tool_name)),
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
// 适配中国三厂商最新旗舰（2026-07-28 网络搜索确认）：
//   - DeepSeek V4（deepseek-v4-pro，base_url https://api.deepseek.com/v1）
//   - GLM-5.2（智谱 AI，base_url https://open.bigmodel.cn/api/paas/v4）
//   - Kimi K3（月之暗面，base_url https://api.moonshot.cn/v1）
//
// 三家厂商全部 OpenAI 兼容 + Bearer Token 认证，统一调用接口。
// 请求经 Rust 端 reqwest 发出（避免前端 CORS，API Key 不暴露到 webview）。
// API Key 经 keyring crate 存操作系统密钥环（ADR-013 V7）。
// ---------------------------------------------------------------------------

/// LLM provider 配置（中国三厂商）
struct LlmProviderConfig {
    base_url: &'static str,
    model: &'static str,
}

/// 根据 provider 名称获取配置（白名单校验）
fn get_provider_config(provider: &str) -> Result<LlmProviderConfig, String> {
    match provider {
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
        _ => Err(format!(
            "unknown provider: {} (allowed: deepseek, glm, kimi)",
            provider
        )),
    }
}

/// 调用 LLM API（OpenAI 兼容格式，三厂商统一接口）
///
/// 安全：
/// - provider 经白名单校验（get_provider_config）
/// - api_key 仅在本次请求的 Authorization header 中使用，不持久化到日志
/// - 请求经 Rust 端发出，前端 webview 不接触 API Key 的网络传输
/// - 超时 60s（思考模式可能较慢）
#[tauri::command]
async fn call_llm_api(
    provider: String,
    api_key: String,
    prompt: String,
    system_prompt: Option<String>,
) -> Result<String, String> {
    let config = get_provider_config(&provider)?;
    let url = format!("{}/chat/completions", config.base_url);

    // 组装 OpenAI 兼容请求体
    let mut messages = Vec::new();
    if let Some(sys) = &system_prompt {
        if !sys.is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
    }
    messages.push(serde_json::json!({"role": "user", "content": prompt}));

    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        // 三厂商均支持 reasoning_effort，思考模式开到 max 提升整理质量
        "reasoning_effort": "max",
        "max_tokens": 4096,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {}", e))?;

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        // 不记录 api_key，只记录状态码和响应片段（最多 500 字符）。
        // L6 fix: 使用 chars().take() 按字符边界截断，避免 &text[..500]
        // 在多字节 UTF-8（如中文错误消息）上 panic。
        let truncated: String = text.chars().take(500).collect();
        return Err(format!("LLM API error {}: {}", status, truncated));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse response JSON: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("missing content in LLM response")?;

    Ok(content.to_string())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
