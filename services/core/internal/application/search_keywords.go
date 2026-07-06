package application

import (
	"regexp"
	"strings"
)

var (
	englishIdentifierPattern = regexp.MustCompile(`[A-Za-z][A-Za-z0-9_-]{1,48}`)
	chineseSegmentPattern    = regexp.MustCompile(`[\p{Han}]{2,12}`)
	mixedEntityPattern       = regexp.MustCompile(`[A-Za-z][A-Za-z0-9_-]*[\p{Han}]+`)
	questionSuffixPattern    = regexp.MustCompile(`(是什么样的|怎么样|如何|什么|哪些|吗|呢|\?|？)+$`)
)

// extractSearchKeywords pulls searchable tokens from a natural-language query.
func extractSearchKeywords(query string) []string {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}

	seen := map[string]struct{}{}
	keywords := make([]string, 0, 8)

	add := func(token string) {
		token = strings.TrimSpace(token)
		if len(token) < 2 {
			return
		}
		if _, ok := seen[token]; ok {
			return
		}
		seen[token] = struct{}{}
		keywords = append(keywords, token)
	}

	for _, match := range mixedEntityPattern.FindAllString(query, -1) {
		add(questionSuffixPattern.ReplaceAllString(match, ""))
	}
	for _, match := range englishIdentifierPattern.FindAllString(query, -1) {
		add(match)
	}
	for _, match := range chineseSegmentPattern.FindAllString(query, -1) {
		add(questionSuffixPattern.ReplaceAllString(match, ""))
	}

	if len(keywords) > 6 {
		keywords = keywords[:6]
	}
	return keywords
}
