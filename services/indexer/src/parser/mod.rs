use serde::{Deserialize, Serialize};
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor, Tree};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SupportedLanguage {
    Rust,
    JavaScript,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParseResult {
    pub language: String,
    pub symbols: Vec<Symbol>,
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

    let symbols = extract_function_symbols(supported, &lang, &tree, source)?;

    Ok(ParseResult {
        language: language.to_string(),
        symbols,
    })
}

fn resolve_language(name: &str) -> Result<SupportedLanguage, String> {
    match name {
        "rust" => Ok(SupportedLanguage::Rust),
        "javascript" | "js" => Ok(SupportedLanguage::JavaScript),
        other => Err(format!("unsupported language: {other}")),
    }
}

fn language_handle(supported: SupportedLanguage) -> Language {
    match supported {
        SupportedLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
        SupportedLanguage::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
    }
}

fn extract_function_symbols(
    supported: SupportedLanguage,
    language: &Language,
    tree: &Tree,
    source: &str,
) -> Result<Vec<Symbol>, String> {
    let query_source = match supported {
        SupportedLanguage::Rust => {
            "(function_item name: (identifier) @name) (struct_item name: (type_identifier) @name)"
        }
        SupportedLanguage::JavaScript => {
            "(function_declaration name: (identifier) @name) (class_declaration name: (identifier) @name)"
        }
    };

    let query = Query::new(language, query_source).map_err(|e| format!("query: {e}"))?;
    let mut cursor = QueryCursor::new();
    let mut symbols = Vec::new();

    let mut matches = cursor.matches(&query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches.next() {
        for capture in m.captures {
            if query.capture_names()[capture.index as usize] != "name" {
                continue;
            }
            let node = capture.node;
            let name = node
                .utf8_text(source.as_bytes())
                .map_err(|e| format!("utf8: {e}"))?
                .to_string();
            symbols.push(Symbol {
                name,
                kind: node
                    .parent()
                    .map(|p| p.kind().to_string())
                    .unwrap_or_else(|| "unknown".into()),
                start_line: node.start_position().row + 1,
                end_line: node.end_position().row + 1,
            });
        }
    }

    Ok(symbols)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_extract_rust_function_when_parsing_hello_world() {
        let source = r#"
fn hello_world() {
    println!("hello");
}

struct Greeter {
    name: String,
}
"#;
        let result = parse_source("rust", source).expect("parse rust");
        assert_eq!(result.language, "rust");
        assert!(result.symbols.iter().any(|s| s.name == "hello_world"));
        assert!(result.symbols.iter().any(|s| s.name == "Greeter"));
    }

    #[test]
    fn should_extract_js_function_when_parsing_hello_world() {
        let source = r#"
function greet() {
  return "hello";
}

class Greeter {}
"#;
        let result = parse_source("javascript", source).expect("parse js");
        assert!(result.symbols.iter().any(|s| s.name == "greet"));
        assert!(result.symbols.iter().any(|s| s.name == "Greeter"));
    }

    #[test]
    fn should_return_error_when_language_unsupported() {
        let err = parse_source("cobol", "IDENTIFICATION DIVISION.").unwrap_err();
        assert!(err.contains("unsupported language"));
    }
}
