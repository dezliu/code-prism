//! 图谱边构建 — 基于符号顺序生成模块内依赖边

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub kind: String,
}

pub fn build_edges(symbols: &[crate::parser::Symbol]) -> Vec<GraphEdge> {
    if symbols.len() < 2 {
        return vec![];
    }
    let mut edges = Vec::new();
    for window in symbols.windows(2) {
        edges.push(GraphEdge {
            from: window[0].name.clone(),
            to: window[1].name.clone(),
            kind: "sequential".into(),
        });
    }
    edges
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Symbol;

    #[test]
    fn should_build_sequential_edges_between_symbols() {
        let symbols = vec![
            Symbol {
                name: "main".into(),
                kind: "function_item".into(),
                start_line: 1,
                end_line: 3,
                class_name: None,
                package_name: None,
                doc_comment: None,
                qualified_name: "main".into(),
            },
            Symbol {
                name: "helper".into(),
                kind: "function_item".into(),
                start_line: 5,
                end_line: 8,
                class_name: None,
                package_name: None,
                doc_comment: None,
                qualified_name: "helper".into(),
            },
        ];
        let edges = build_edges(&symbols);
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].from, "main");
        assert_eq!(edges[0].to, "helper");
    }
}
