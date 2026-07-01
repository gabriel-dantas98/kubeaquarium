package k8s

import (
	"fmt"
	"sort"
	"strings"

	"k8s.io/apimachinery/pkg/labels"
)

type WatchOptions struct {
	Namespaces    []string
	LabelSelector string
}

func NewWatchOptions(namespaces []string, labelSelector string) (WatchOptions, error) {
	opts := WatchOptions{
		Namespaces:    normalizeNamespaces(namespaces),
		LabelSelector: strings.TrimSpace(labelSelector),
	}
	if opts.LabelSelector != "" {
		selector, err := labels.Parse(opts.LabelSelector)
		if err != nil {
			return WatchOptions{}, fmt.Errorf("invalid label selector %q: %w", labelSelector, err)
		}
		opts.LabelSelector = selector.String()
	}
	return opts, nil
}

func normalizeNamespaces(values []string) []string {
	seen := make(map[string]struct{})
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			namespace := strings.TrimSpace(part)
			if namespace == "" {
				continue
			}
			seen[namespace] = struct{}{}
		}
	}

	out := make([]string, 0, len(seen))
	for namespace := range seen {
		out = append(out, namespace)
	}
	sort.Strings(out)
	return out
}
