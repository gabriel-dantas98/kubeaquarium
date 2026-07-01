package k8s

import (
	"sort"

	"k8s.io/client-go/tools/clientcmd"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace"`
	Current   bool   `json:"current"`
}

func ListContexts(kubeconfigPath string) ([]ContextInfo, error) {
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loader.ExplicitPath = kubeconfigPath
	}
	cfg, err := loader.Load()
	if err != nil {
		return nil, err
	}
	out := make([]ContextInfo, 0, len(cfg.Contexts))
	for name, c := range cfg.Contexts {
		out = append(out, ContextInfo{
			Name:      name,
			Cluster:   c.Cluster,
			Namespace: c.Namespace,
			Current:   name == cfg.CurrentContext,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func WithCurrentContext(contexts []ContextInfo, contextName string) []ContextInfo {
	out := make([]ContextInfo, len(contexts))
	for i, c := range contexts {
		c.Current = c.Name == contextName
		out[i] = c
	}
	return out
}

func ClientForContext(kubeconfigPath, contextName string) (clientcmd.ClientConfig, error) {
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loader.ExplicitPath = kubeconfigPath
	}
	overrides := &clientcmd.ConfigOverrides{}
	if contextName != "" {
		overrides.CurrentContext = contextName
	}
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, overrides), nil
}
