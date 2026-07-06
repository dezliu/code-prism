//! 图谱边构建占位 — Batch 5 索引流水线实现

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub kind: String,
}

pub fn build_edges(_symbols: &[crate::parser::Symbol]) -> Vec<GraphEdge> {
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Symbol;

    #[test]
    fn should_return_empty_edges_for_scaffold_placeholder() {
        let symbols = vec![Symbol {
            name: "main".into(),
            kind: "function_item".into(),
            start_line: 1,
            end_line: 3,
        }];
        assert!(build_edges(&symbols).is_empty());
    }
}
