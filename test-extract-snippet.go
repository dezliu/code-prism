package main

import (
	"fmt"
	"os"
	"path/filepath"

	gitclient "github.com/lingprism/core/internal/infrastructure/git"
)

func main() {
	// 创建 Git Client
	workDir := os.Getenv("GIT_WORK_DIR")
	if workDir == "" {
		workDir = filepath.Join(os.TempDir(), "lingprism-repos")
	}
	
	client := gitclient.NewClient(workDir)
	
	fmt.Println("=== 测试代码片段提取功能 ===")
	fmt.Printf("Git 工作目录: %s\n\n", workDir)
	
	// 检查是否有本地仓库
	repoID := "00000000-0000-4000-8000-000000000010" // code-prism repo
	localPath := client.LocalPath(repoID)
	
	if _, err := os.Stat(localPath); os.IsNotExist(err) {
		fmt.Printf("❌ 仓库 %s 未克隆到本地\n", repoID)
		fmt.Printf("   期望路径: %s\n", localPath)
		fmt.Println("\n请先触发索引，让 Git Sync 克隆仓库")
		os.Exit(1)
	}
	
	fmt.Printf("✅ 找到本地仓库: %s\n\n", localPath)
	
	// 尝试提取一个已知文件的代码片段
	// 这里使用当前项目的文件作为示例
	testFile := "services/core/internal/infrastructure/git/client.go"
	startLine := 207
	endLine := 220
	
	fmt.Printf("测试提取:\n")
	fmt.Printf("  文件: %s\n", testFile)
	fmt.Printf("  行数: %d-%d\n\n", startLine, endLine)
	
	snippet, err := client.ExtractCodeSnippet(repoID, testFile, startLine, endLine)
	if err != nil {
		fmt.Printf("❌ 提取失败: %v\n", err)
		os.Exit(1)
	}
	
	fmt.Println("✅ 提取成功！代码片段:")
	fmt.Println("---")
	fmt.Println(snippet)
	fmt.Println("---")
	fmt.Println("\n🎉 代码片段提取功能正常工作！")
}
