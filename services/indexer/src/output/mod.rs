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
    fn should_build_sequential_edges_when_formatting_parse_result() {
        let parse = ParseResult {
            language: "rust".into(),
            symbols: vec![
                Symbol { name: "main".into(), kind: "function_item".into(), start_line: 1, end_line: 1 },
                Symbol { name: "helper".into(), kind: "function_item".into(), start_line: 2, end_line: 2 },
            ],
        };
        let output = format_output(parse);
        assert_eq!(output.edges.len(), 1);
    }
}
