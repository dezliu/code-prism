mod graph;
mod output;
mod parser;

use clap::{Parser, Subcommand};
use parser::parse_source;

#[derive(Parser)]
#[command(name = "lingprism-indexer", version, about = "LingPrism code indexer")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Parse a source file and output symbols as JSON
    Parse {
        #[arg(long, default_value = "rust")]
        language: String,
        #[arg(long)]
        file: String,
    },
    /// Print version and exit
    Version,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Version => {
            println!("lingprism-indexer {}", env!("CARGO_PKG_VERSION"));
        }
        Commands::Parse { language, file } => {
            let source = std::fs::read_to_string(&file)?;
            let result = parse_source(&language, &source)?;
            let output = output::format_output(result, &file);
            println!("{}", output::to_json(&output)?);
        }
    }

    Ok(())
}
