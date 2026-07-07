use serde::{Deserialize, Serialize};
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor, Tree};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SupportedLanguage {
    Rust,
    JavaScript,
    TypeScript,
    Go,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub start_line: usize,
    pub end_line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_comment: Option<String>,
    pub qualified_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParseResult {
    pub language: String,
    pub symbols: Vec<Symbol>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
}

pub fn parse_source(language: &str, source: &str) -> Result<ParseResult, String> {
    let supported = resolve_language(language)?;
    let lang = language_handle(supported);
    let mut parser = Parser::new();
    parser
        .set_language(&lang)
        .map_err(|e| format!("set language: {e}"))?;

    let tree = parser
        .parse(source, None)
        .ok_or_else(|| "failed to parse source".to_string())?;

    let file_package = extract_file_package(supported, &tree, source);
    let symbols = extract_symbols(supported, &lang, &tree, source, file_package.as_deref())?;

    Ok(ParseResult {
        language: language.to_string(),
        symbols,
        package_name: file_package,
    })
}

fn resolve_language(name: &str) -> Result<SupportedLanguage, String> {
    match name {
        "rust" => Ok(SupportedLanguage::Rust),
        "javascript" | "js" => Ok(SupportedLanguage::JavaScript),
        "typescript" | "ts" | "tsx" => Ok(SupportedLanguage::TypeScript),
        "go" => Ok(SupportedLanguage::Go),
        other => Err(format!("unsupported language: {other}")),
    }
}

fn language_handle(supported: SupportedLanguage) -> Language {
    match supported {
        SupportedLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
        SupportedLanguage::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        SupportedLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        SupportedLanguage::Go => tree_sitter_go::LANGUAGE.into(),
    }
}

fn extract_file_package(
    supported: SupportedLanguage,
    tree: &Tree,
    source: &str,
) -> Option<String> {
    match supported {
        SupportedLanguage::Go => {
            let lang = language_handle(supported);
            let query = Query::new(
                &lang,
                "(package_clause (package_identifier) @pkg)",
            )
            .ok()?;
            first_capture_text(&query, tree, source, "pkg")
        }
        SupportedLanguage::Rust => {
            if let Some(m) = regex_lite_match(source, r"(?m)^mod\s+(\w+)") {
                return Some(m);
            }
            None
        }
        _ => None,
    }
}

fn regex_lite_match(source: &str, pattern: &str) -> Option<String> {
    let re = pattern;
    if pattern.contains("mod") {
        for line in source.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("mod ") {
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
    }
    let _ = re;
    None
}

fn query_source_for(supported: SupportedLanguage) -> &'static str {
    match supported {
        SupportedLanguage::Rust => {
            "(function_item name: (identifier) @name) @def
             (struct_item name: (type_identifier) @name) @def"
        }
        SupportedLanguage::JavaScript | SupportedLanguage::TypeScript => {
            "(function_declaration name: (identifier) @name) @def
             (class_declaration name: (identifier) @name) @def
             (method_definition name: (property_identifier) @name) @def"
        }
        SupportedLanguage::Go => {
            "(function_declaration name: (identifier) @name) @def
             (method_declaration name: (field_identifier) @name) @def
             (type_declaration (type_spec name: (type_identifier) @name)) @def"
        }
    }
}

fn extract_symbols(
    supported: SupportedLanguage,
    language: &Language,
    tree: &Tree,
    source: &str,
    file_package: Option<&str>,
) -> Result<Vec<Symbol>, String> {
    let query_source = query_source_for(supported);
    let query = Query::new(language, query_source).map_err(|e| format!("query: {e}"))?;
    let mut cursor = QueryCursor::new();
    let mut symbols = Vec::new();
    let mut class_context: Option<String> = None;

    let mut matches = cursor.matches(&query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches.next() {
        let mut name: Option<String> = None;
        let mut def_node = None;
        let mut class_name: Option<String> = None;

        for capture in m.captures {
            let cap_name = query.capture_names()[capture.index as usize];
            let node = capture.node;
            match cap_name {
                "class" => {
                    class_context = node
                        .utf8_text(source.as_bytes())
                        .ok()
                        .map(|s| s.to_string());
                    class_name = class_context.clone();
                }
                "name" => {
                    name = node
                        .utf8_text(source.as_bytes())
                        .ok()
                        .map(|s| s.to_string());
                }
                "def" => {
                    def_node = Some(node);
                    if class_name.is_none() {
                        class_name = find_enclosing_class(node, source);
                    }
                }
                _ => {}
            }
        }

        let Some(sym_name) = name else { continue };
        let Some(def) = def_node else { continue };

        let kind = def.kind().to_string();
        let start_line = def.start_position().row + 1;
        let end_line = def.end_position().row + 1;
        let doc_comment = extract_preceding_comment(def, source);
        let effective_class = class_name.or_else(|| class_context.clone());
        let qualified_name = build_qualified_name(
            supported,
            file_package,
            effective_class.as_deref(),
            &sym_name,
            &kind,
        );

        symbols.push(Symbol {
            name: sym_name,
            kind,
            start_line,
            end_line,
            class_name: effective_class,
            package_name: file_package.map(|s| s.to_string()),
            doc_comment,
            qualified_name,
        });
    }

    Ok(symbols)
}

fn find_enclosing_class(node: tree_sitter::Node, source: &str) -> Option<String> {
    let mut current = node.parent();
    while let Some(n) = current {
        let kind = n.kind();
        if kind == "class_declaration" || kind == "struct_item" || kind == "type_spec" {
            for child in n.children(&mut n.walk()) {
                if child.kind().contains("identifier") || child.kind() == "type_identifier" {
                    if let Ok(text) = child.utf8_text(source.as_bytes()) {
                        return Some(text.to_string());
                    }
                }
            }
        }
        current = n.parent();
    }
    None
}

fn extract_preceding_comment(node: tree_sitter::Node, source: &str) -> Option<String> {
    let start_byte = node.start_byte();
    let prefix = &source[..start_byte];
    let lines: Vec<&str> = prefix.lines().collect();
    let mut comment_lines: Vec<String> = Vec::new();

    for line in lines.iter().rev().take(20) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !comment_lines.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with("//")
            || trimmed.starts_with("///")
            || trimmed.starts_with("/**")
            || trimmed.starts_with("*")
            || trimmed.starts_with("/*")
        {
            comment_lines.push(trimmed.to_string());
            continue;
        }
        break;
    }

    if comment_lines.is_empty() {
        return None;
    }
    comment_lines.reverse();
    let joined = comment_lines.join("\n");
    Some(clean_comment(&joined))
}

fn clean_comment(raw: &str) -> String {
    raw.lines()
        .map(|l| {
            l.trim()
                .trim_start_matches("///")
                .trim_start_matches("//")
                .trim_start_matches("/**")
                .trim_start_matches("/*")
                .trim_start_matches('*')
                .trim_end_matches("*/")
                .trim()
        })
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_qualified_name(
    supported: SupportedLanguage,
    package: Option<&str>,
    class_name: Option<&str>,
    method_name: &str,
    kind: &str,
) -> String {
    match supported {
        SupportedLanguage::Go => {
            if let Some(cls) = class_name {
                if kind.contains("method") {
                    if let Some(pkg) = package {
                        return format!("{pkg}.{cls}.{method_name}");
                    }
                    return format!("{cls}.{method_name}");
                }
            }
            if let Some(pkg) = package {
                format!("{pkg}.{method_name}")
            } else {
                method_name.to_string()
            }
        }
        SupportedLanguage::Rust | SupportedLanguage::JavaScript | SupportedLanguage::TypeScript => {
            if let Some(cls) = class_name {
                if kind.contains("function") || kind.contains("method") {
                    return format!("{cls}#{method_name}");
                }
                return format!("{cls}");
            }
            method_name.to_string()
        }
    }
}

fn first_capture_text(query: &Query, tree: &Tree, source: &str, capture: &str) -> Option<String> {
    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches.next() {
        for cap in m.captures {
            if query.capture_names()[cap.index as usize] == capture {
                return cap.node.utf8_text(source.as_bytes()).ok().map(|s| s.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_extract_rust_function_when_parsing_hello_world() {
        let source = r#"
/// Greets the world
fn hello_world() {
    println!("hello");
}

struct Greeter {
    name: String,
}
"#;
        let result = parse_source("rust", source).expect("parse rust");
        assert_eq!(result.language, "rust");
        let hello = result.symbols.iter().find(|s| s.name == "hello_world").unwrap();
        assert!(hello.doc_comment.as_ref().unwrap().contains("Greets"));
        assert_eq!(hello.qualified_name, "hello_world");
        assert!(result.symbols.iter().any(|s| s.name == "Greeter"));
    }

    #[test]
    fn should_extract_js_function_when_parsing_hello_world() {
        let source = r#"
/** Greet helper */
function greet() {
  return "hello";
}

class Greeter {}
"#;
        let result = parse_source("javascript", source).expect("parse js");
        let greet = result.symbols.iter().find(|s| s.name == "greet").unwrap();
        assert!(greet.doc_comment.is_some());
        assert!(result.symbols.iter().any(|s| s.name == "Greeter"));
    }

    #[test]
    fn should_extract_go_function_with_package() {
        let source = r#"
package order

// Rollback reverts order state
func Rollback() {}
"#;
        let result = parse_source("go", source).expect("parse go");
        assert_eq!(result.package_name.as_deref(), Some("order"));
        let rollback = result.symbols.iter().find(|s| s.name == "Rollback").unwrap();
        assert_eq!(rollback.qualified_name, "order.Rollback");
        assert!(rollback.doc_comment.as_ref().unwrap().contains("Rollback"));
    }

    #[test]
    fn should_return_error_when_language_unsupported() {
        let err = parse_source("cobol", "IDENTIFICATION DIVISION.").unwrap_err();
        assert!(err.contains("unsupported language"));
    }
}
