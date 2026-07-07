use crate::graph::{build_edges, GraphEdge};
use crate::parser::ParseResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexerOutput {
    pub file_path: String,
    pub parse: ParseResult,
    pub edges: Vec<GraphEdge>,
    pub version: String,
}

pub fn format_output(parse: ParseResult, file_path: &str) -> IndexerOutput {
    let edges = build_edges(&parse.symbols);
    IndexerOutput {
        file_path: file_path.to_string(),
        parse,
        edges,
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub fn to_json(output: &IndexerOutput) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Symbol;

    #[test]
    fn should_build_sequential_edges_when_formatting_parse_result() {
        let parse = ParseResult {
            language: "rust".into(),
            package_name: None,
            symbols: vec![
                Symbol {
                    name: "main".into(),
                    kind: "function_item".into(),
                    start_line: 1,
                    end_line: 1,
                    class_name: None,
                    package_name: None,
                    doc_comment: None,
                    qualified_name: "main".into(),
                },
                Symbol {
                    name: "helper".into(),
                    kind: "function_item".into(),
                    start_line: 2,
                    end_line: 2,
                    class_name: None,
                    package_name: None,
                    doc_comment: None,
                    qualified_name: "helper".into(),
                },
            ],
        };
        let output = format_output(parse, "src/main.rs");
        assert_eq!(output.file_path, "src/main.rs");
        assert_eq!(output.edges.len(), 1);
    }
}
