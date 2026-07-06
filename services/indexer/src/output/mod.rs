use crate::graph::{build_edges, GraphEdge};
use crate::parser::ParseResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexerOutput {
    pub parse: ParseResult,
    pub edges: Vec<GraphEdge>,
    pub version: String,
}

pub fn format_output(parse: ParseResult) -> IndexerOutput {
    let edges = build_edges(&parse.symbols);
    IndexerOutput {
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
    use crate::parser::{parse_source, Symbol};

    #[test]
    fn should_include_empty_edges_when_formatting_parse_result() {
        let parse = ParseResult {
            language: "rust".into(),
            symbols: vec![Symbol {
                name: "main".into(),
                kind: "function_item".into(),
                start_line: 1,
                end_line: 1,
            }],
        };
        let output = format_output(parse);
        assert_eq!(output.edges, vec![]);
        assert_eq!(output.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn should_wire_graph_module_when_parsing_rust_source() {
        let source = "fn hello() {}";
        let parse = parse_source("rust", source).expect("parse");
        let output = format_output(parse);
        assert!(output.edges.is_empty());
    }
}
